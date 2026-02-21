<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import Toast from '$lib/components/Toast.svelte'
  import { ui } from '$lib/stores/ui.svelte'

  let { children } = $props()

  const BACK_EXIT_WINDOW_MS = 2000

  onMount(() => {
    if (!/Android/i.test(navigator.userAgent)) return

    let lastBackAttemptAt = 0

    ;(window as any).__aventuraBackHandler = () => {
      // Close open overlays before triggering exit flow
      if (ui.settingsModalOpen) {
        ui.closeSettings()
        return
      }
      if (ui.syncModalOpen) {
        ui.closeSyncModal()
        return
      }
      if (ui.debugModalOpen) {
        ui.closeDebugModal()
        return
      }
      if (ui.lorebookImportModalOpen) {
        ui.closeLorebookImport()
        return
      }
      if (ui.lorebookExportModalOpen) {
        ui.closeLorebookExport()
        return
      }
      if (ui.manualChapterModalOpen) {
        ui.closeManualChapterModal()
        return
      }
      if (ui.resummarizeModalOpen) {
        ui.closeResummarizeModal()
        return
      }
      if (ui.lorebookDebugOpen) {
        ui.closeLorebookDebug()
        return
      }
      if (ui.sidebarOpen && window.innerWidth < 640) {
        ui.toggleSidebar()
        return
      }

      const now = Date.now()
      const pressedBackAgain = now - lastBackAttemptAt <= BACK_EXIT_WINDOW_MS

      if (pressedBackAgain) {
        lastBackAttemptAt = 0
        import('@tauri-apps/plugin-process').then(({ exit }) => exit(0))
        return
      }

      lastBackAttemptAt = now
      ui.showToast('Press back again to exit', 'info', BACK_EXIT_WINDOW_MS)
    }

    return () => {
      delete (window as any).__aventuraBackHandler
    }
  })
</script>

<div class="h-screen w-screen overflow-hidden">
  {@render children()}
</div>

<Toast />
