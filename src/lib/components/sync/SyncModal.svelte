<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { syncService } from '$lib/services/sync'
  import { exportService } from '$lib/services/export'
  import { getVersion } from '@tauri-apps/api/app'
  import {
    QrCode,
    Camera,
    Upload,
    Download,
    Loader2,
    AlertTriangle,
    RefreshCw,
    Check,
    Search,
    Keyboard,
    Smartphone,
    Monitor,
    CheckSquare,
    Square,
  } from 'lucide-svelte'
  import { Html5Qrcode } from 'html5-qrcode'
  import type {
    SyncServerInfo,
    SyncStoryPreview,
    SyncConnectionData,
    SyncRole,
    SyncEvent,
    DiscoveredDevice,
  } from '$lib/types/sync'
  import { SYNC_PORT } from '$lib/types/sync'
  import { onDestroy, onMount } from 'svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Card, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // User-selected role (shared across all platforms)
  let syncRole = $state<SyncRole | null>(null)

  // Server state (mobile)
  let serverInfo = $state<SyncServerInfo | null>(null)

  // Client connection state
  let connection = $state<SyncConnectionData | null>(null)
  let remoteStories = $state<SyncStoryPreview[]>([])
  let localStories = $state<SyncStoryPreview[]>([])
  let selectedRemoteStories = $state<SyncStoryPreview[]>([])
  let selectedLocalStories = $state<SyncStoryPreview[]>([])

  // Batch sync progress
  let syncProgress = $state<{ current: number; total: number } | null>(null)

  // Discovery state (PC)
  let discoveredDevices = $state<DiscoveredDevice[]>([])

  // Manual entry state (PC)
  let manualIp = $state('')
  let manualCode = $state('')

  // General UI state
  let loading = $state(false)
  let error = $state<string | null>(null)
  let showConflictWarning = $state(false)
  let conflictStoryTitle = $state<string | null>(null)
  let conflictingTitles = $state<string[]>([])
  let syncSuccess = $state(false)
  let syncMessage = $state<string | null>(null)

  // Server activity events (mobile)
  let syncEvents = $state<SyncEvent[]>([])

  // Received story state (server polling)
  let receivedStoryJson = $state<string | null>(null)
  let receivedStoryPreview = $state<SyncStoryPreview | null>(null)
  let showReceivedConflict = $state(false)
  let receivedStoryQueue = $state<string[]>([])
  let pollingInterval: ReturnType<typeof setInterval> | null = null

  // Discovery polling
  let discoveryInterval: ReturnType<typeof setInterval> | null = null

  // Version mismatch state
  let remoteVersion = $state<string | null>(null)
  let localVersion = $state<string | null>(null)
  let showVersionWarning = $state(false)
  let pendingConnection = $state<SyncConnectionData | null>(null)

  // QR Scanner
  let scanner: Html5Qrcode | null = null
  let scannerElementId = 'qr-reader'

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  // Reset state when modal opens — show role selection screen
  $effect(() => {
    if (ui.syncModalOpen) {
      resetState()
      ui.setSyncMode('role')
    }
  })

  onDestroy(() => {
    cleanup()
  })

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  function resetState() {
    syncRole = null
    serverInfo = null
    connection = null
    remoteStories = []
    localStories = []
    selectedRemoteStories = []
    selectedLocalStories = []
    syncProgress = null
    discoveredDevices = []
    syncEvents = []
    manualIp = ''
    manualCode = ''
    loading = false
    error = null
    showConflictWarning = false
    conflictStoryTitle = null
    conflictingTitles = []
    syncSuccess = false
    syncMessage = null
    receivedStoryJson = null
    receivedStoryPreview = null
    showReceivedConflict = false
    receivedStoryQueue = []
    remoteVersion = null
    localVersion = null
    showVersionWarning = false
    pendingConnection = null
    stopPolling()
    stopDiscoveryPolling()
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }
  }

  function startPolling() {
    stopPolling()
    pollingInterval = setInterval(checkForReceivedStories, 1000)
  }

  function stopDiscoveryPolling() {
    if (discoveryInterval) {
      clearInterval(discoveryInterval)
      discoveryInterval = null
    }
  }

  function startDiscoveryPolling() {
    stopDiscoveryPolling()
    discoveryInterval = setInterval(pollDiscoveredDevices, 1500)
  }

  async function cleanup() {
    stopPolling()
    stopDiscoveryPolling()
    if (scanner) {
      try {
        await scanner.stop()
      } catch {
        // Ignore errors when stopping
      }
      scanner = null
    }
    if (serverInfo) {
      try {
        await syncService.stopServer()
      } catch {
        // Ignore
      }
    }
    try {
      await syncService.stopBroadcast()
    } catch {
      // Ignore
    }
    try {
      await syncService.stopDiscovery()
    } catch {
      // Ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Role selection (all platforms)
  // ---------------------------------------------------------------------------

  function selectShareRole() {
    syncRole = 'server'
    startServerMode()
  }

  function selectReceiveRole() {
    syncRole = 'client'
    ui.setSyncMode('select')
  }

  // ---------------------------------------------------------------------------
  // Server mode (share stories)
  // ---------------------------------------------------------------------------

  async function stopServerAndGoBack() {
    stopPolling()
    try {
      await syncService.stopBroadcast()
    } catch {
      // Ignore
    }
    try {
      await syncService.stopServer()
    } catch {
      // Ignore
    }
    serverInfo = null
    syncEvents = []
    syncRole = null
    ui.setSyncMode('role')
  }

  async function startServerMode() {
    ui.setSyncMode('generate')
    loading = true
    error = null

    try {
      // Export all stories for the server
      const storiesJson = await syncService.exportAllStoriesToJson()
      serverInfo = await syncService.startServer(storiesJson)

      // Start UDP broadcast for auto-discovery by PC
      try {
        await syncService.startBroadcast(serverInfo.ip, serverInfo.port)
      } catch {
        // UDP broadcast is best-effort; QR code is the fallback
        console.warn('[Sync] UDP broadcast failed to start')
      }

      // Start polling for pushed stories from PC
      startPolling()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start server'
      syncRole = null
      ui.setSyncMode('role')
    } finally {
      loading = false
    }
  }

  // Server: check for activity events AND stories pushed by PC
  async function checkForReceivedStories() {
    try {
      // Poll for sync events (connected, pulled, etc.)
      const events = await syncService.getSyncEvents()
      if (events.length > 0) {
        syncEvents = [...syncEvents, ...events]
        await syncService.clearSyncEvents()
      }

      // If already processing a story (e.g. conflict dialog), skip fetching more
      if (receivedStoryJson) return

      // Poll for received (pushed) stories — enqueue all of them
      const received = await syncService.getReceivedStories()
      if (received.length > 0) {
        receivedStoryQueue = [...receivedStoryQueue, ...received]
        await syncService.clearReceivedStories()
      }

      // Process next story from queue
      await processNextReceivedStory()
    } catch {
      // Ignore polling errors
    }
  }

  // Process the next story in the received queue
  async function processNextReceivedStory() {
    if (receivedStoryQueue.length === 0) return
    if (receivedStoryJson) return // Already processing one

    const storyJson = receivedStoryQueue[0]
    receivedStoryQueue = receivedStoryQueue.slice(1)

    const preview = syncService.getStoryPreview(storyJson)
    if (preview) {
      receivedStoryJson = storyJson
      receivedStoryPreview = preview

      const exists = await syncService.checkStoryExists(preview.title)
      if (exists) {
        showReceivedConflict = true
      } else {
        await importReceivedStory()
      }
    } else {
      // Invalid story, skip and try next
      await processNextReceivedStory()
    }
  }

  async function importReceivedStory() {
    if (!receivedStoryJson || !receivedStoryPreview) return

    const title = receivedStoryPreview.title ?? 'Unknown'
    loading = true
    error = null
    showReceivedConflict = false

    try {
      // Remove existing story with same title (best-effort)
      try {
        const existingId = await syncService.findStoryIdByTitle(title)
        if (existingId) {
          try {
            await syncService.createPreSyncBackup(existingId)
          } catch {
            console.warn('[Sync] Pre-sync backup failed (non-fatal)')
          }
          await syncService.deleteStory(existingId)
        }
      } catch {
        console.warn('[Sync] Failed to remove existing story (non-fatal)')
      }

      const result = await exportService.importFromContent(receivedStoryJson, true)

      if (result.success) {
        await story.loadAllStories()
        syncSuccess = true
        syncMessage = `Successfully received "${title}"`
      } else {
        error = result.error ?? 'Import failed'
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Import failed'
    } finally {
      loading = false
      receivedStoryJson = null
      receivedStoryPreview = null
      // Process next queued story if any
      await processNextReceivedStory()
    }
  }

  function cancelReceivedImport() {
    showReceivedConflict = false
    receivedStoryJson = null
    receivedStoryPreview = null
    // Process next queued story instead of just resuming polling
    processNextReceivedStory()
    startPolling()
  }

  // ---------------------------------------------------------------------------
  // Client modes (PC)
  // ---------------------------------------------------------------------------

  // -- QR Code scanning --

  async function startScanMode() {
    ui.setSyncMode('scan')
    error = null

    // Wait for DOM to update
    await new Promise((resolve) => setTimeout(resolve, 100))
    await initScanner()
  }

  async function initScanner() {
    try {
      scanner = new Html5Qrcode(scannerElementId)

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          await handleQrScanned(decodedText)
        },
        () => {
          // Ignore scan failures during continuous scanning
        },
      )

      // Apply zoom for mobile (more reliable after camera starts)
      try {
        const videoElement = document.querySelector(
          `#${scannerElementId} video`,
        ) as HTMLVideoElement
        if (videoElement && videoElement.srcObject) {
          const track = (videoElement.srcObject as MediaStream).getVideoTracks()[0]
          const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
            zoom?: { min: number; max: number }
          }
          if (capabilities.zoom) {
            const maxZoom = capabilities.zoom.max
            const targetZoom = Math.min(maxZoom, 2.5)
            await track.applyConstraints({
              advanced: [{ zoom: targetZoom } as MediaTrackConstraintSet],
            })
          }
        }
      } catch {
        // Zoom not supported, continue without it
      }
    } catch {
      error = 'Camera access denied or not available'
      ui.setSyncMode('select')
    }
  }

  async function handleQrScanned(data: string) {
    if (scanner) {
      try {
        await scanner.stop()
      } catch {
        // Ignore
      }
      scanner = null
    }

    try {
      const parsed = syncService.parseQrCode(data)
      const appVersion = await getVersion()

      if (!parsed.version || parsed.version !== appVersion) {
        pendingConnection = parsed
        remoteVersion = parsed.version ?? null
        localVersion = appVersion
        showVersionWarning = true
        return
      }

      await proceedWithConnection(parsed)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed'
      ui.setSyncMode('select')
    }
  }

  // -- Auto-Discovery --

  async function startDiscoverMode() {
    ui.setSyncMode('discover')
    error = null
    discoveredDevices = []

    try {
      await syncService.startDiscovery()
      startDiscoveryPolling()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start discovery'
      ui.setSyncMode('select')
    }
  }

  async function pollDiscoveredDevices() {
    try {
      discoveredDevices = await syncService.getDiscoveredDevices()
    } catch {
      // Ignore polling errors
    }
  }

  // The discovered device the user tapped (awaiting connect code input)
  let selectedDiscoveredDevice = $state<DiscoveredDevice | null>(null)
  let discoveryConnectCode = $state('')

  async function selectDiscoveredDevice(device: DiscoveredDevice) {
    const appVersion = await getVersion()

    if (device.version && device.version !== appVersion) {
      pendingDiscoveredDevice = device
      remoteVersion = device.version
      localVersion = appVersion
      showVersionWarning = true
      return
    }

    // Show inline connect code prompt for this device
    selectedDiscoveredDevice = device
    discoveryConnectCode = ''
    error = null
  }

  async function connectToSelectedDevice() {
    if (!selectedDiscoveredDevice || !discoveryConnectCode.trim()) {
      error = 'Please enter the 6-digit code shown on the other device'
      return
    }

    stopDiscoveryPolling()
    try {
      await syncService.stopDiscovery()
    } catch {
      // Ignore
    }

    loading = true
    error = null

    try {
      const stories = await syncService.connectWithCode(
        selectedDiscoveredDevice.ip,
        discoveryConnectCode.trim(),
      )

      connection = {
        ip: selectedDiscoveredDevice.ip,
        port: SYNC_PORT,
        token: discoveryConnectCode.trim(),
      }
      ui.setSyncMode('connected')
      remoteStories = stories

      const allLocalStories = story.allStories
      localStories = allLocalStories.map((s) => ({
        id: s.id,
        title: s.title,
        genre: s.genre ?? null,
        updatedAt: s.updatedAt,
        entryCount: 0,
      }))
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed'
      // Keep the device selected so user can retry
    } finally {
      loading = false
    }
  }

  function deselectDiscoveredDevice() {
    selectedDiscoveredDevice = null
    discoveryConnectCode = ''
    error = null
  }

  // Stored discovered device when version mismatch occurs
  let pendingDiscoveredDevice = $state<DiscoveredDevice | null>(null)

  // -- Manual Entry --

  function startManualMode() {
    ui.setSyncMode('manual')
    error = null
    manualIp = ''
    manualCode = ''
  }

  async function connectManual() {
    if (!manualIp.trim() || !manualCode.trim()) {
      error = 'Please enter both IP address and connection code'
      return
    }

    loading = true
    error = null

    try {
      const stories = await syncService.connectWithCode(manualIp.trim(), manualCode.trim())

      connection = {
        ip: manualIp.trim(),
        port: SYNC_PORT,
        token: manualCode.trim(),
      }
      ui.setSyncMode('connected')
      remoteStories = stories

      const allLocalStories = story.allStories
      localStories = allLocalStories.map((s) => ({
        id: s.id,
        title: s.title,
        genre: s.genre ?? null,
        updatedAt: s.updatedAt,
        entryCount: 0,
      }))
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed'
    } finally {
      loading = false
    }
  }

  // -- Version mismatch handling --

  function cancelVersionMismatch() {
    showVersionWarning = false
    pendingConnection = null
    pendingDiscoveredDevice = null
    remoteVersion = null
    localVersion = null
    ui.setSyncMode('select')
  }

  async function proceedWithVersionMismatch() {
    showVersionWarning = false
    remoteVersion = null
    localVersion = null

    // If this came from a discovered device, show inline code prompt
    if (pendingDiscoveredDevice) {
      selectedDiscoveredDevice = pendingDiscoveredDevice
      discoveryConnectCode = ''
      error = null
      pendingDiscoveredDevice = null
      pendingConnection = null
      return
    }

    // Otherwise proceed with a full connection (QR code flow has the token)
    if (!pendingConnection) return
    await proceedWithConnection(pendingConnection)
    pendingConnection = null
  }

  // -- Shared connection logic --

  async function proceedWithConnection(conn: SyncConnectionData) {
    try {
      connection = conn
      ui.setSyncMode('connected')

      loading = true
      remoteStories = await syncService.connect(connection)

      const allLocalStories = story.allStories
      localStories = allLocalStories.map((s) => ({
        id: s.id,
        title: s.title,
        genre: s.genre ?? null,
        updatedAt: s.updatedAt,
        entryCount: 0,
      }))
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed'
      ui.setSyncMode('select')
    } finally {
      loading = false
    }
  }

  // ---------------------------------------------------------------------------
  // Multi-select helpers
  // ---------------------------------------------------------------------------

  function toggleRemoteStory(s: SyncStoryPreview) {
    const idx = selectedRemoteStories.findIndex((r) => r.id === s.id)
    if (idx >= 0) {
      selectedRemoteStories = selectedRemoteStories.filter((r) => r.id !== s.id)
    } else {
      selectedRemoteStories = [...selectedRemoteStories, s]
      // Deselect any local stories when selecting remote (pull vs push)
      selectedLocalStories = []
    }
  }

  function toggleLocalStory(s: SyncStoryPreview) {
    const idx = selectedLocalStories.findIndex((l) => l.id === s.id)
    if (idx >= 0) {
      selectedLocalStories = selectedLocalStories.filter((l) => l.id !== s.id)
    } else {
      selectedLocalStories = [...selectedLocalStories, s]
      // Deselect any remote stories when selecting local (push vs pull)
      selectedRemoteStories = []
    }
  }

  function selectAllRemote() {
    selectedRemoteStories = [...remoteStories]
    selectedLocalStories = []
  }

  function deselectAllRemote() {
    selectedRemoteStories = []
  }

  function selectAllLocal() {
    selectedLocalStories = [...localStories]
    selectedRemoteStories = []
  }

  function deselectAllLocal() {
    selectedLocalStories = []
  }

  // ---------------------------------------------------------------------------
  // Story sync actions (same for both roles when in connected mode)
  // ---------------------------------------------------------------------------

  async function pullStories() {
    if (!connection || selectedRemoteStories.length === 0) return

    // Check for conflicts across all selected stories
    if (!showConflictWarning) {
      const conflicts: string[] = []
      for (const s of selectedRemoteStories) {
        const exists = await syncService.checkStoryExists(s.title)
        if (exists) conflicts.push(s.title)
      }
      if (conflicts.length > 0) {
        conflictingTitles = conflicts
        conflictStoryTitle = conflicts.join(', ')
        showConflictWarning = true
        return
      }
    }

    ui.setSyncMode('syncing')
    loading = true
    error = null
    showConflictWarning = false
    conflictingTitles = []

    const total = selectedRemoteStories.length
    let succeeded = 0
    const failed: string[] = []

    try {
      for (let i = 0; i < total; i++) {
        const rs = selectedRemoteStories[i]
        syncProgress = { current: i + 1, total }

        try {
          // Remove existing story with same title (best-effort)
          try {
            const existingId = await syncService.findStoryIdByTitle(rs.title)
            if (existingId) {
              try {
                await syncService.createPreSyncBackup(existingId)
              } catch {
                console.warn('[Sync] Pre-sync backup failed (non-fatal)')
              }
              await syncService.deleteStory(existingId)
            }
          } catch {
            console.warn('[Sync] Failed to remove existing story (non-fatal)')
          }

          const storyJson = await syncService.pullStory(connection, rs.id)
          const result = await exportService.importFromContent(storyJson, true)

          if (result.success) {
            succeeded++
          } else {
            failed.push(rs.title)
          }
        } catch {
          failed.push(rs.title)
        }
      }

      await story.loadAllStories()
      syncSuccess = true

      if (failed.length === 0) {
        syncMessage =
          total === 1
            ? `Successfully pulled "${selectedRemoteStories[0].title}"`
            : `Successfully pulled ${succeeded} ${succeeded === 1 ? 'story' : 'stories'}`
      } else {
        syncMessage = `Pulled ${succeeded} of ${total} stories. Failed: ${failed.join(', ')}`
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Pull failed'
    } finally {
      loading = false
      syncProgress = null
    }
  }

  async function pushStories() {
    if (!connection || selectedLocalStories.length === 0) return

    ui.setSyncMode('syncing')
    loading = true
    error = null

    const total = selectedLocalStories.length
    let succeeded = 0
    const failed: string[] = []

    try {
      for (let i = 0; i < total; i++) {
        const ls = selectedLocalStories[i]
        syncProgress = { current: i + 1, total }

        try {
          // Backup is best-effort
          try {
            await syncService.createPreSyncBackup(ls.id)
          } catch {
            console.warn('[Sync] Pre-sync backup failed (non-fatal)')
          }

          const storyJson = await syncService.exportStoryToJson(ls.id)
          await syncService.pushStory(connection, storyJson)
          succeeded++
        } catch {
          failed.push(ls.title)
        }
      }

      syncSuccess = true

      if (failed.length === 0) {
        syncMessage =
          total === 1
            ? `Successfully pushed "${selectedLocalStories[0].title}"`
            : `Successfully pushed ${succeeded} ${succeeded === 1 ? 'story' : 'stories'}`
      } else {
        syncMessage = `Pushed ${succeeded} of ${total} stories. Failed: ${failed.join(', ')}`
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Push failed'
    } finally {
      loading = false
      syncProgress = null
    }
  }

  function cancelConflict() {
    showConflictWarning = false
    conflictStoryTitle = null
    conflictingTitles = []
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------

  async function close() {
    await cleanup()
    ui.closeSyncModal()
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function onOpenChange(open: boolean) {
    if (!open) {
      close()
    }
  }

  function goBack() {
    error = null
    selectedDiscoveredDevice = null
    discoveryConnectCode = ''
    if (scanner) {
      scanner.stop().catch(() => {})
      scanner = null
    }
    stopDiscoveryPolling()
    syncService.stopDiscovery().catch(() => {})
    // From client sub-modes, go back to client mode selection
    // From client mode selection, go back to role selection
    if (ui.syncMode === 'select') {
      syncRole = null
      ui.setSyncMode('role')
    } else {
      ui.setSyncMode('select')
    }
  }
</script>

<ResponsiveModal.Root open={ui.syncModalOpen} {onOpenChange}>
  <ResponsiveModal.Content class="sm:max-w-lg">
    <ResponsiveModal.Header>
      <ResponsiveModal.Title class="flex items-center gap-2">
        <RefreshCw class="text-primary h-5 w-5" />
        {#if ui.syncMode === 'role'}
          Local Network Sync
        {:else if ui.syncMode === 'generate'}
          Waiting for Connection
        {:else if ui.syncMode === 'select'}
          Connect to Device
        {:else if ui.syncMode === 'scan'}
          Scan QR Code
        {:else if ui.syncMode === 'discover'}
          Searching for Devices
        {:else if ui.syncMode === 'manual'}
          Manual Connection
        {:else if ui.syncMode === 'connected'}
          Select Story to Sync
        {:else if ui.syncMode === 'syncing'}
          Syncing...
        {:else}
          Local Network Sync
        {/if}
      </ResponsiveModal.Title>
      <ResponsiveModal.Description>
        {#if ui.syncMode === 'role'}
          Sync stories between devices on your local network.
        {:else if ui.syncMode === 'generate'}
          Connect from another device to sync stories.
        {:else if ui.syncMode === 'select'}
          Choose how to find the other device on the network.
        {:else if ui.syncMode === 'scan'}
          Point your camera at the QR code on the other device.
        {:else if ui.syncMode === 'discover'}
          Looking for Aventuras devices on your local network...
        {:else if ui.syncMode === 'manual'}
          Enter the IP address and connection code shown on the other device.
        {:else if ui.syncMode === 'connected'}
          Choose a story to transfer between devices.
        {/if}
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="min-h-0 flex-1 overflow-y-auto py-4">
      {#if error}
        <div
          class="bg-destructive/15 text-destructive mb-4 flex items-center gap-2 rounded-lg p-3 text-sm"
        >
          <AlertTriangle class="h-4 w-4 shrink-0" />
          {error}
        </div>
      {/if}

      <!-- ============================================================= -->
      <!-- SUCCESS STATE (shared) -->
      <!-- ============================================================= -->
      {#if syncSuccess}
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <Check class="h-8 w-8 text-green-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Sync Complete!</h3>
          <p class="text-muted-foreground">{syncMessage}</p>
          <Button class="mt-6" onclick={close}>Done</Button>
        </div>

        <!-- ============================================================= -->
        <!-- VERSION MISMATCH WARNING (shared) -->
        <!-- ============================================================= -->
      {:else if showVersionWarning}
        <div class="flex flex-col items-center py-4 text-center">
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20"
          >
            <AlertTriangle class="h-8 w-8 text-amber-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold">Version Mismatch</h3>
          <p class="text-muted-foreground mb-2">
            The remote device is running a different version of Aventuras.
          </p>
          <div class="text-muted-foreground/80 mb-4 text-sm">
            <p>Local: v{localVersion}</p>
            <p>Remote: {remoteVersion ? `v${remoteVersion}` : 'unknown'}</p>
          </div>
          <p class="text-muted-foreground mb-4 text-sm">
            Syncing between different versions may cause issues. Continue anyway?
          </p>
          <div class="flex gap-3">
            <Button variant="outline" onclick={cancelVersionMismatch}>Cancel</Button>
            <Button onclick={proceedWithVersionMismatch}>Continue Anyway</Button>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- ROLE SELECTION (all platforms) -->
        <!-- ============================================================= -->
      {:else if ui.syncMode === 'role'}
        <div class="grid grid-cols-1 gap-3">
          <Card
            class="hover:bg-muted/50 cursor-pointer transition-colors"
            onclick={selectShareRole}
          >
            <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Upload class="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle class="text-base">Share My Stories</CardTitle>
                <CardDescription>
                  Make this device's stories available to another device via QR code
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card
            class="hover:bg-muted/50 cursor-pointer transition-colors"
            onclick={selectReceiveRole}
          >
            <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Download class="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle class="text-base">Get Stories from Another Device</CardTitle>
                <CardDescription>
                  Connect to another device by scanning its QR code or entering a code
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>

        <!-- ============================================================= -->
        <!-- SERVER MODE: Generate QR Code (any platform) -->
        <!-- ============================================================= -->
      {:else if syncRole === 'server' && ui.syncMode === 'generate'}
        {#if showReceivedConflict && receivedStoryPreview}
          <!-- Conflict warning for received push -->
          <div class="flex flex-col items-center py-4 text-center">
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20"
            >
              <AlertTriangle class="h-8 w-8 text-amber-500" />
            </div>
            <h3 class="mb-2 text-lg font-semibold">Story Already Exists</h3>
            <p class="text-muted-foreground mb-4">
              A story named "{receivedStoryPreview.title}" already exists on this device. Replacing
              it will create a "Pre-sync backup" checkpoint first. Continue?
            </p>
            <div class="flex gap-3">
              <Button variant="outline" onclick={cancelReceivedImport}>Cancel</Button>
              <Button onclick={importReceivedStory}>Replace</Button>
            </div>
          </div>
        {:else if loading}
          <div class="flex flex-col items-center justify-center py-12">
            <Loader2 class="text-primary h-8 w-8 animate-spin" />
            <p class="text-muted-foreground mt-4">Starting server...</p>
          </div>
        {:else if serverInfo}
          <div class="flex flex-col items-center text-center">
            <!-- QR Code -->
            <div class="mb-4 inline-block rounded-lg bg-white p-4">
              <img
                src="data:image/png;base64,{serverInfo.qrCodeBase64}"
                alt="QR Code"
                class="h-64 w-64"
              />
            </div>

            <p class="text-muted-foreground text-sm">
              Scan this QR code from another device, or enter the details below manually.
            </p>

            <!-- Connection details for manual entry -->
            <div class="bg-muted/50 mt-4 w-full rounded-lg p-3">
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="text-muted-foreground text-right">IP Address:</div>
                <div class="text-left font-mono font-medium">{serverInfo.ip}</div>
                <div class="text-muted-foreground text-right">Port:</div>
                <div class="text-left font-mono font-medium">{serverInfo.port}</div>
                <div class="text-muted-foreground text-right">Code:</div>
                <div class="text-left font-mono text-lg font-bold tracking-widest">
                  {serverInfo.connectCode}
                </div>
              </div>
            </div>

            <!-- Activity log -->
            {#if syncEvents.length > 0}
              <div class="mt-4 w-full space-y-1.5">
                {#each syncEvents as event, i (event.eventType + ':' + event.message + ':' + i)}
                  <div
                    class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm {event.eventType ===
                    'connected'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : event.eventType === 'pulled'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-primary/10 text-primary'}"
                  >
                    <Check class="h-3.5 w-3.5 shrink-0" />
                    <span>{event.message}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-muted-foreground/60 mt-3 text-xs">
                Waiting for another device to connect...
              </p>
            {/if}

            <Button variant="outline" class="mt-4" onclick={stopServerAndGoBack}>Back</Button>
          </div>
        {/if}

        <!-- ============================================================= -->
        <!-- CLIENT: Mode Selection -->
        <!-- ============================================================= -->
      {:else if syncRole === 'client' && ui.syncMode === 'select'}
        <div class="grid grid-cols-1 gap-3">
          <Card class="hover:bg-muted/50 cursor-pointer transition-colors" onclick={startScanMode}>
            <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Camera class="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle class="text-base">Scan QR Code</CardTitle>
                <CardDescription
                  >Use your camera to scan the QR code on the other device</CardDescription
                >
              </div>
            </CardHeader>
          </Card>

          <Card
            class="hover:bg-muted/50 cursor-pointer transition-colors"
            onclick={startDiscoverMode}
          >
            <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Search class="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle class="text-base">Auto-Discover</CardTitle>
                <CardDescription
                  >Automatically find Aventuras devices on your network</CardDescription
                >
              </div>
            </CardHeader>
          </Card>

          <Card
            class="hover:bg-muted/50 cursor-pointer transition-colors"
            onclick={startManualMode}
          >
            <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Keyboard class="text-primary h-6 w-6" />
              </div>
              <div>
                <CardTitle class="text-base">Enter Manually</CardTitle>
                <CardDescription
                  >Type the IP address and code shown on the other device</CardDescription
                >
              </div>
            </CardHeader>
          </Card>
        </div>

        <!-- ============================================================= -->
        <!-- CLIENT: QR Scanner -->
        <!-- ============================================================= -->
      {:else if syncRole === 'client' && ui.syncMode === 'scan'}
        <div class="flex flex-col items-center text-center">
          <div
            id={scannerElementId}
            class="mb-4 overflow-hidden rounded-lg bg-black"
            style="width: 300px; height: 300px;"
          ></div>
          <p class="text-muted-foreground text-sm">Point your camera at the QR code</p>
          <Button variant="outline" class="mt-4" onclick={goBack}>Back</Button>
        </div>

        <!-- ============================================================= -->
        <!-- CLIENT: Auto-Discovery -->
        <!-- ============================================================= -->
      {:else if syncRole === 'client' && ui.syncMode === 'discover'}
        <div class="flex flex-col items-center">
          {#if selectedDiscoveredDevice}
            <!-- Inline connect code prompt for selected device -->
            <div class="w-full space-y-4">
              <Card class="border-primary/30 bg-primary/5">
                <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-3">
                  <div class="bg-primary/10 rounded-lg p-2">
                    <Smartphone class="text-primary h-5 w-5" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <CardTitle class="text-sm">{selectedDiscoveredDevice.deviceName}</CardTitle>
                    <CardDescription class="font-mono text-xs"
                      >{selectedDiscoveredDevice.ip}:{selectedDiscoveredDevice.port}</CardDescription
                    >
                  </div>
                  {#if selectedDiscoveredDevice.version}
                    <Badge variant="secondary" class="text-[10px]"
                      >v{selectedDiscoveredDevice.version}</Badge
                    >
                  {/if}
                </CardHeader>
              </Card>
              <div class="space-y-2">
                <label for="discovery-code" class="text-sm font-medium"
                  >Enter the 6-digit code from the other device</label
                >
                <Input
                  id="discovery-code"
                  type="text"
                  placeholder="000000"
                  bind:value={discoveryConnectCode}
                  maxlength={6}
                  class="font-mono text-center text-lg tracking-widest"
                />
              </div>
              <div class="flex gap-2">
                <Button variant="outline" onclick={deselectDiscoveredDevice}>Back</Button>
                <Button onclick={connectToSelectedDevice} disabled={loading} class="flex-1">
                  {#if loading}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  {:else}
                    Connect
                  {/if}
                </Button>
              </div>
            </div>
          {:else if discoveredDevices.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 class="text-primary mb-4 h-8 w-8 animate-spin" />
              <p class="text-muted-foreground text-sm">
                Searching for devices on your network...
              </p>
              <p class="text-muted-foreground/60 mt-1 text-xs">
                Make sure the other device has Aventuras Sync open
              </p>
            </div>
            <Button variant="outline" class="mt-4" onclick={goBack}>Back</Button>
          {:else}
            <div class="w-full space-y-2">
              <p class="text-muted-foreground mb-3 text-sm">
                Found {discoveredDevices.length} device{discoveredDevices.length !== 1 ? 's' : ''}:
              </p>
              {#each discoveredDevices as device (device.ip)}
                <Card
                  class="hover:bg-muted/50 cursor-pointer transition-colors"
                  onclick={() => selectDiscoveredDevice(device)}
                >
                  <CardHeader class="flex flex-row items-center gap-4 space-y-0 p-3">
                    <div class="bg-primary/10 rounded-lg p-2">
                      <Smartphone class="text-primary h-5 w-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <CardTitle class="text-sm">{device.deviceName}</CardTitle>
                      <CardDescription class="font-mono text-xs"
                        >{device.ip}:{device.port}</CardDescription
                      >
                    </div>
                    {#if device.version}
                      <Badge variant="secondary" class="text-[10px]">v{device.version}</Badge>
                    {/if}
                  </CardHeader>
                </Card>
              {/each}
            </div>
            <Button variant="outline" class="mt-4" onclick={goBack}>Back</Button>
          {/if}
        </div>

        <!-- ============================================================= -->
        <!-- CLIENT: Manual Entry -->
        <!-- ============================================================= -->
      {:else if syncRole === 'client' && ui.syncMode === 'manual'}
        <div class="space-y-4">
          <div class="space-y-2">
            <label for="manual-ip" class="text-sm font-medium">IP Address</label>
            <Input
              id="manual-ip"
              type="text"
              placeholder="e.g. 192.168.1.42"
              bind:value={manualIp}
            />
          </div>
          <div class="space-y-2">
            <label for="manual-code" class="text-sm font-medium">Connection Code</label>
            <Input
              id="manual-code"
              type="text"
              placeholder="6-digit code from mobile"
              bind:value={manualCode}
              maxlength={6}
              class="font-mono text-lg tracking-widest"
            />
          </div>
          <p class="text-muted-foreground text-xs">
            Enter the IP address and 6-digit code shown on the other device's sync screen.
          </p>
          <div class="flex gap-2">
            <Button variant="outline" onclick={goBack}>Back</Button>
            <Button onclick={connectManual} disabled={loading} class="flex-1">
              {#if loading}
                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {:else}
                <Monitor class="mr-2 h-4 w-4" />
              {/if}
              Connect
            </Button>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- CONNECTED: Story Selection (shared for both roles) -->
        <!-- ============================================================= -->
      {:else if ui.syncMode === 'connected'}
        {#if loading}
          <div class="flex flex-col items-center justify-center py-8">
            <Loader2 class="text-primary h-8 w-8 animate-spin" />
            <p class="text-muted-foreground mt-4">Connecting...</p>
          </div>
        {:else}
          <!-- Conflict Warning -->
          {#if showConflictWarning}
            <div class="mb-4 rounded-lg bg-amber-500/15 p-4 text-amber-600 dark:text-amber-500">
              <div class="mb-2 flex items-center gap-2">
                <AlertTriangle class="h-5 w-5" />
                <span class="font-semibold"
                  >{conflictingTitles.length === 1
                    ? 'Story Already Exists'
                    : `${conflictingTitles.length} Stories Already Exist`}</span
                >
              </div>
              <p class="text-sm">
                {#if conflictingTitles.length === 1}
                  A story named "{conflictingTitles[0]}" already exists on this device. Pulling will
                  replace it after creating a "Pre-sync backup" checkpoint.
                {:else}
                  The following stories already exist: {conflictingTitles.join(', ')}. Pulling will
                  replace them after creating backups.
                {/if}
              </p>
              <div class="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" onclick={cancelConflict}>Cancel</Button>
                <Button size="sm" onclick={pullStories}>Continue Anyway</Button>
              </div>
            </div>
          {/if}

          <div class="space-y-6">
            <!-- Pull Stories (from remote) -->
            <div>
              <div class="mb-2 flex items-center justify-between">
                <h3 class="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                  <Download class="h-4 w-4" />
                  Pull from Other Device
                </h3>
                {#if remoteStories.length > 1}
                  <button
                    class="text-primary text-xs hover:underline"
                    onclick={() =>
                      selectedRemoteStories.length === remoteStories.length
                        ? deselectAllRemote()
                        : selectAllRemote()}
                  >
                    {selectedRemoteStories.length === remoteStories.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                {/if}
              </div>
              {#if remoteStories.length > 0}
                <ScrollArea class="h-32 rounded-md border p-1 sm:h-40">
                  {#each remoteStories as remoteStory (remoteStory.id)}
                    {@const isSelected = selectedRemoteStories.some(
                      (s) => s.id === remoteStory.id,
                    )}
                    <button
                      class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left {isSelected
                        ? 'bg-accent text-accent-foreground'
                        : ''}"
                      onclick={() => toggleRemoteStory(remoteStory)}
                    >
                      <div class="shrink-0">
                        {#if isSelected}
                          <CheckSquare class="text-primary h-4 w-4" />
                        {:else}
                          <Square class="text-muted-foreground h-4 w-4" />
                        {/if}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex w-full items-center justify-between">
                          <span class="truncate font-medium">{remoteStory.title}</span>
                          {#if remoteStory.genre}
                            <Badge variant="secondary" class="ml-2 h-5 shrink-0 text-[10px]"
                              >{remoteStory.genre}</Badge
                            >
                          {/if}
                        </div>
                        <div class="text-muted-foreground text-xs">
                          {remoteStory.entryCount} entries • Updated {formatDate(
                            remoteStory.updatedAt,
                          )}
                        </div>
                      </div>
                    </button>
                  {/each}
                </ScrollArea>
              {:else}
                <div class="text-muted-foreground py-4 text-center text-sm">
                  No stories available on remote device
                </div>
              {/if}
            </div>

            <!-- Push Stories (to remote) -->
            <div>
              <div class="mb-2 flex items-center justify-between">
                <h3 class="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                  <Upload class="h-4 w-4" />
                  Push to Other Device
                </h3>
                {#if localStories.length > 1}
                  <button
                    class="text-primary text-xs hover:underline"
                    onclick={() =>
                      selectedLocalStories.length === localStories.length
                        ? deselectAllLocal()
                        : selectAllLocal()}
                  >
                    {selectedLocalStories.length === localStories.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                {/if}
              </div>
              {#if localStories.length > 0}
                <ScrollArea class="h-32 rounded-md border p-1 sm:h-40">
                  {#each localStories as localStory (localStory.id)}
                    {@const isSelected = selectedLocalStories.some(
                      (s) => s.id === localStory.id,
                    )}
                    <button
                      class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left {isSelected
                        ? 'bg-accent text-accent-foreground'
                        : ''}"
                      onclick={() => toggleLocalStory(localStory)}
                    >
                      <div class="shrink-0">
                        {#if isSelected}
                          <CheckSquare class="text-primary h-4 w-4" />
                        {:else}
                          <Square class="text-muted-foreground h-4 w-4" />
                        {/if}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex w-full items-center justify-between">
                          <span class="truncate font-medium">{localStory.title}</span>
                          {#if localStory.genre}
                            <Badge variant="secondary" class="ml-2 h-5 shrink-0 text-[10px]"
                              >{localStory.genre}</Badge
                            >
                          {/if}
                        </div>
                        <div class="text-muted-foreground text-xs">
                          Updated {formatDate(localStory.updatedAt)}
                        </div>
                      </div>
                    </button>
                  {/each}
                </ScrollArea>
              {:else}
                <div class="text-muted-foreground py-4 text-center text-sm">
                  No local stories to push
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ============================================================= -->
        <!-- SYNCING STATE (shared) -->
        <!-- ============================================================= -->
      {:else if ui.syncMode === 'syncing'}
        <div class="flex flex-col items-center justify-center py-12">
          <Loader2 class="text-primary h-8 w-8 animate-spin" />
          <p class="text-muted-foreground mt-4">
            {selectedRemoteStories.length > 0 ? 'Pulling' : 'Pushing'}
            {syncProgress && syncProgress.total > 1
              ? ` story ${syncProgress.current} of ${syncProgress.total}...`
              : ' story...'}
          </p>
          {#if syncProgress && syncProgress.total > 1}
            <div class="bg-muted mt-3 h-2 w-48 overflow-hidden rounded-full">
              <div
                class="bg-primary h-full rounded-full transition-all duration-300"
                style="width: {(syncProgress.current / syncProgress.total) * 100}%"
              ></div>
            </div>
          {/if}
          <p class="text-muted-foreground/80 mt-1 text-sm">Please wait</p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    {#if ui.syncMode === 'connected' && !showConflictWarning && !loading && !syncSuccess}
      <ResponsiveModal.Footer>
        <div class="flex w-full items-center justify-between gap-2">
          <Button variant="outline" onclick={close}>Cancel</Button>
          <div class="flex items-center gap-2">
            {#if selectedRemoteStories.length > 0}
              <span class="text-muted-foreground text-xs"
                >{selectedRemoteStories.length} selected</span
              >
              <Button onclick={pullStories}>
                <Download class="mr-2 h-4 w-4" />
                Pull {selectedRemoteStories.length === 1
                  ? 'Story'
                  : `${selectedRemoteStories.length} Stories`}
              </Button>
            {:else if selectedLocalStories.length > 0}
              <span class="text-muted-foreground text-xs"
                >{selectedLocalStories.length} selected</span
              >
              <Button onclick={pushStories}>
                <Upload class="mr-2 h-4 w-4" />
                Push {selectedLocalStories.length === 1
                  ? 'Story'
                  : `${selectedLocalStories.length} Stories`}
              </Button>
            {/if}
          </div>
        </div>
      </ResponsiveModal.Footer>
    {/if}
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
