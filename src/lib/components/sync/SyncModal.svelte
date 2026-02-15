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

  // Platform role (determined on mount)
  let syncRole = $state<SyncRole>('client')
  let roleLoaded = $state(false)

  // Server state (mobile)
  let serverInfo = $state<SyncServerInfo | null>(null)

  // Client connection state
  let connection = $state<SyncConnectionData | null>(null)
  let remoteStories = $state<SyncStoryPreview[]>([])
  let localStories = $state<SyncStoryPreview[]>([])
  let selectedRemoteStory = $state<SyncStoryPreview | null>(null)
  let selectedLocalStory = $state<SyncStoryPreview | null>(null)

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
  let syncSuccess = $state(false)
  let syncMessage = $state<string | null>(null)

  // Server activity events (mobile)
  let syncEvents = $state<SyncEvent[]>([])

  // Received story state (server polling)
  let receivedStoryJson = $state<string | null>(null)
  let receivedStoryPreview = $state<SyncStoryPreview | null>(null)
  let showReceivedConflict = $state(false)
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

  onMount(async () => {
    try {
      syncRole = (await syncService.getSyncRole()) as SyncRole
    } catch {
      // Default to client if detection fails (safer for firewalls)
      syncRole = 'client'
    }
    roleLoaded = true
  })

  // Reset state when modal opens
  $effect(() => {
    if (ui.syncModalOpen && roleLoaded) {
      resetState()
      if (syncRole === 'server') {
        // Mobile: auto-start server mode
        startServerMode()
      }
    }
  })

  onDestroy(() => {
    cleanup()
  })

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  function resetState() {
    serverInfo = null
    connection = null
    remoteStories = []
    localStories = []
    selectedRemoteStory = null
    selectedLocalStory = null
    discoveredDevices = []
    syncEvents = []
    manualIp = ''
    manualCode = ''
    loading = false
    error = null
    showConflictWarning = false
    conflictStoryTitle = null
    syncSuccess = false
    syncMessage = null
    receivedStoryJson = null
    receivedStoryPreview = null
    showReceivedConflict = false
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
  // Server mode (mobile)
  // ---------------------------------------------------------------------------

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
        await syncService.startBroadcast(serverInfo.ip, serverInfo.port, serverInfo.token)
      } catch {
        // UDP broadcast is best-effort; QR code is the fallback
        console.warn('[Sync] UDP broadcast failed to start')
      }

      // Start polling for pushed stories from PC
      startPolling()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start server'
      ui.setSyncMode('select')
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

      // Poll for received (pushed) stories
      const received = await syncService.getReceivedStories()
      if (received.length > 0) {
        const storyJson = received[0]
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
        }

        await syncService.clearReceivedStories()
        // Don't stop polling — keep listening for more activity
      }
    } catch {
      // Ignore polling errors
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
    }
  }

  function cancelReceivedImport() {
    showReceivedConflict = false
    receivedStoryJson = null
    receivedStoryPreview = null
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

  async function connectToDiscoveredDevice(device: DiscoveredDevice) {
    stopDiscoveryPolling()
    try {
      await syncService.stopDiscovery()
    } catch {
      // Ignore
    }

    const appVersion = await getVersion()

    if (device.version && device.version !== appVersion) {
      pendingConnection = {
        ip: device.ip,
        port: device.port,
        token: device.token,
        version: device.version,
      }
      remoteVersion = device.version
      localVersion = appVersion
      showVersionWarning = true
      return
    }

    await proceedWithConnection({
      ip: device.ip,
      port: device.port,
      token: device.token,
      version: device.version,
    })
  }

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
    remoteVersion = null
    localVersion = null
    ui.setSyncMode('select')
  }

  async function proceedWithVersionMismatch() {
    if (!pendingConnection) return
    showVersionWarning = false
    remoteVersion = null
    localVersion = null
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
  // Story sync actions (same for both roles when in connected mode)
  // ---------------------------------------------------------------------------

  async function pullStory() {
    if (!connection || !selectedRemoteStory) return

    const exists = await syncService.checkStoryExists(selectedRemoteStory.title)
    if (exists && !showConflictWarning) {
      conflictStoryTitle = selectedRemoteStory.title
      showConflictWarning = true
      return
    }

    ui.setSyncMode('syncing')
    loading = true
    error = null
    showConflictWarning = false

    try {
      // Remove existing story with same title (best-effort)
      try {
        const existingId = await syncService.findStoryIdByTitle(selectedRemoteStory.title)
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

      const storyJson = await syncService.pullStory(connection, selectedRemoteStory.id)
      const result = await exportService.importFromContent(storyJson, true)

      if (result.success) {
        await story.loadAllStories()
        syncSuccess = true
        syncMessage = `Successfully pulled "${selectedRemoteStory.title}"`
      } else {
        error = result.error ?? 'Import failed'
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Pull failed'
    } finally {
      loading = false
    }
  }

  async function pushStory() {
    if (!connection || !selectedLocalStory) return

    ui.setSyncMode('syncing')
    loading = true
    error = null

    try {
      // Backup is best-effort — don't fail the push if backup fails
      try {
        await syncService.createPreSyncBackup(selectedLocalStory.id)
      } catch (backupErr) {
        console.warn('[Sync] Pre-sync backup failed (non-fatal):', backupErr)
      }

      const storyJson = await syncService.exportStoryToJson(selectedLocalStory.id)
      await syncService.pushStory(connection, storyJson)

      syncSuccess = true
      syncMessage = `Successfully pushed "${selectedLocalStory.title}"`
    } catch (e) {
      error = e instanceof Error ? e.message : 'Push failed'
    } finally {
      loading = false
    }
  }

  function cancelConflict() {
    showConflictWarning = false
    conflictStoryTitle = null
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
    if (scanner) {
      scanner.stop().catch(() => {})
      scanner = null
    }
    stopDiscoveryPolling()
    syncService.stopDiscovery().catch(() => {})
    ui.setSyncMode('select')
  }
</script>

<ResponsiveModal.Root open={ui.syncModalOpen} {onOpenChange}>
  <ResponsiveModal.Content class="sm:max-w-lg">
    <ResponsiveModal.Header>
      <ResponsiveModal.Title class="flex items-center gap-2">
        <RefreshCw class="text-primary h-5 w-5" />
        {#if !roleLoaded}
          Local Network Sync
        {:else if syncRole === 'server'}
          <!-- Mobile server titles -->
          {#if ui.syncMode === 'generate'}
            Waiting for Connection
          {:else}
            Local Network Sync
          {/if}
        {:else}
          <!-- PC client titles -->
          {#if ui.syncMode === 'select'}
            Connect to Mobile Device
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
        {/if}
      </ResponsiveModal.Title>
      <ResponsiveModal.Description>
        {#if !roleLoaded}
          Detecting platform...
        {:else if syncRole === 'server'}
          {#if ui.syncMode === 'generate'}
            Connect from your PC to sync stories.
          {:else}
            Sync stories between this device and your PC.
          {/if}
        {:else}
          {#if ui.syncMode === 'select'}
            Choose how to find your mobile device on the network.
          {:else if ui.syncMode === 'scan'}
            Point your camera at the QR code on the mobile device.
          {:else if ui.syncMode === 'discover'}
            Looking for Aventuras devices on your local network...
          {:else if ui.syncMode === 'manual'}
            Enter the IP address and connection code shown on your mobile device.
          {:else if ui.syncMode === 'connected'}
            Choose a story to transfer between devices.
          {/if}
        {/if}
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="py-4">
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
        <!-- LOADING (not yet determined) -->
        <!-- ============================================================= -->
      {:else if !roleLoaded}
        <div class="flex flex-col items-center justify-center py-12">
          <Loader2 class="text-primary h-8 w-8 animate-spin" />
          <p class="text-muted-foreground mt-4">Detecting platform...</p>
        </div>

        <!-- ============================================================= -->
        <!-- MOBILE SERVER: Generate QR Code -->
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
              Scan this QR code from your PC, or enter the details below manually.
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
                {#each syncEvents as event (event.message)}
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
                Waiting for PC to connect...
              </p>
            {/if}
          </div>
        {/if}

        <!-- ============================================================= -->
        <!-- PC CLIENT: Mode Selection -->
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
                  >Use your webcam to scan the QR code on the mobile device</CardDescription
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
                  >Type the IP address and code shown on the mobile device</CardDescription
                >
              </div>
            </CardHeader>
          </Card>
        </div>

        <!-- ============================================================= -->
        <!-- PC CLIENT: QR Scanner -->
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
        <!-- PC CLIENT: Auto-Discovery -->
        <!-- ============================================================= -->
      {:else if syncRole === 'client' && ui.syncMode === 'discover'}
        <div class="flex flex-col items-center">
          {#if discoveredDevices.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 class="text-primary mb-4 h-8 w-8 animate-spin" />
              <p class="text-muted-foreground text-sm">
                Searching for devices on your network...
              </p>
              <p class="text-muted-foreground/60 mt-1 text-xs">
                Make sure the mobile device has Aventuras Sync open
              </p>
            </div>
          {:else}
            <div class="w-full space-y-2">
              <p class="text-muted-foreground mb-3 text-sm">
                Found {discoveredDevices.length} device{discoveredDevices.length !== 1 ? 's' : ''}:
              </p>
              {#each discoveredDevices as device (device.ip)}
                <Card
                  class="hover:bg-muted/50 cursor-pointer transition-colors"
                  onclick={() => connectToDiscoveredDevice(device)}
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
          {/if}
          <Button variant="outline" class="mt-4" onclick={goBack}>Back</Button>
        </div>

        <!-- ============================================================= -->
        <!-- PC CLIENT: Manual Entry -->
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
            Enter the IP address and 6-digit code shown on the mobile device's sync screen.
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
                <span class="font-semibold">Story Already Exists</span>
              </div>
              <p class="text-sm">
                A story named "{conflictStoryTitle}" already exists on this device. Pulling will
                replace it after creating a "Pre-sync backup" checkpoint.
              </p>
              <div class="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" onclick={cancelConflict}>Cancel</Button>
                <Button size="sm" onclick={pullStory}>Continue Anyway</Button>
              </div>
            </div>
          {/if}

          <div class="space-y-6">
            <!-- Pull Stories (from remote) -->
            <div>
              <h3 class="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
                <Download class="h-4 w-4" />
                Pull from {syncRole === 'client' ? 'Mobile Device' : 'Remote Device'}
              </h3>
              {#if remoteStories.length > 0}
                <ScrollArea class="h-40 rounded-md border p-1">
                  {#each remoteStories as remoteStory (remoteStory.id)}
                    <button
                      class="hover:bg-accent hover:text-accent-foreground flex w-full flex-col items-start gap-1 rounded-sm px-3 py-2 text-left {selectedRemoteStory?.id ===
                      remoteStory.id
                        ? 'bg-accent text-accent-foreground ring-primary ring-1'
                        : ''}"
                      onclick={() => {
                        selectedRemoteStory = remoteStory
                        selectedLocalStory = null
                      }}
                    >
                      <div class="flex w-full items-center justify-between">
                        <span class="truncate font-medium">{remoteStory.title}</span>
                        {#if remoteStory.genre}
                          <Badge variant="secondary" class="h-5 text-[10px]"
                            >{remoteStory.genre}</Badge
                          >
                        {/if}
                      </div>
                      <div class="text-muted-foreground text-xs">
                        {remoteStory.entryCount} entries • Updated {formatDate(
                          remoteStory.updatedAt,
                        )}
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
              <h3 class="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
                <Upload class="h-4 w-4" />
                Push to {syncRole === 'client' ? 'Mobile Device' : 'Remote Device'}
              </h3>
              {#if localStories.length > 0}
                <ScrollArea class="h-40 rounded-md border p-1">
                  {#each localStories as localStory (localStory.id)}
                    <button
                      class="hover:bg-accent hover:text-accent-foreground flex w-full flex-col items-start gap-1 rounded-sm px-3 py-2 text-left {selectedLocalStory?.id ===
                      localStory.id
                        ? 'bg-accent text-accent-foreground ring-primary ring-1'
                        : ''}"
                      onclick={() => {
                        selectedLocalStory = localStory
                        selectedRemoteStory = null
                      }}
                    >
                      <div class="flex w-full items-center justify-between">
                        <span class="truncate font-medium">{localStory.title}</span>
                        {#if localStory.genre}
                          <Badge variant="secondary" class="h-5 text-[10px]"
                            >{localStory.genre}</Badge
                          >
                        {/if}
                      </div>
                      <div class="text-muted-foreground text-xs">
                        Updated {formatDate(localStory.updatedAt)}
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
            {selectedRemoteStory ? 'Pulling' : 'Pushing'} story...
          </p>
          <p class="text-muted-foreground/80 mt-1 text-sm">Please wait</p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    {#if ui.syncMode === 'connected' && !showConflictWarning && !loading && !syncSuccess}
      <ResponsiveModal.Footer>
        <div class="flex w-full justify-end gap-2">
          <Button variant="outline" onclick={close}>Cancel</Button>
          {#if selectedRemoteStory}
            <Button onclick={pullStory}>
              <Download class="mr-2 h-4 w-4" />
              Pull Story
            </Button>
          {:else if selectedLocalStory}
            <Button onclick={pushStory}>
              <Upload class="mr-2 h-4 w-4" />
              Push Story
            </Button>
          {/if}
        </div>
      </ResponsiveModal.Footer>
    {/if}
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
