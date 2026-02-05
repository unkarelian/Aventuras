<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { AlertTriangle, X, Settings } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'

  let hasInvalid = $derived(settings.hasInvalidProfiles())
  let shouldShow = $derived(hasInvalid && !ui.profileWarningDismissed)

  function handleFixProfiles() {
    ui.openSettingsToApiTab()
  }

  function handleDismiss() {
    ui.dismissProfileWarning()
  }
</script>

{#if shouldShow}
  <div
    class="flex items-center justify-between gap-3 bg-amber-500/90 px-4 py-2 text-amber-950 shadow-md"
  >
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <AlertTriangle class="h-5 w-5 shrink-0" />
      <p class="truncate text-sm font-medium">
        Your API profiles need to be updated. Please reconfigure them to continue using AI features.
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        class="bg-amber-950 text-amber-100 hover:bg-amber-900 hover:text-amber-50"
        onclick={handleFixProfiles}
      >
        <Settings class="h-4 w-4" />
        <span class="hidden sm:inline">Fix Profiles</span>
        <span class="sm:hidden">Fix</span>
      </Button>
      <button
        class="rounded p-1 transition-colors hover:bg-amber-600/50"
        onclick={handleDismiss}
        title="Dismiss for this session"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
{/if}
