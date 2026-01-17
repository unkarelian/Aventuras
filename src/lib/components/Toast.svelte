<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { X, AlertTriangle, Info, AlertCircle } from 'lucide-svelte';

  function getIcon() {
    switch (ui.toastType) {
      case 'error':
        return AlertCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
      default:
        return Info;
    }
  }

  function getBackgroundColor() {
    switch (ui.toastType) {
      case 'error':
        return 'bg-red-600';
      case 'warning':
        return 'bg-amber-600';
      case 'info':
      default:
        return 'bg-blue-600';
    }
  }

  function handleClick() {
    ui.hideToast();
  }
</script>

{#if ui.toastVisible}
  <div
    class="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex items-start gap-3 px-4 py-3 rounded-lg shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 {getBackgroundColor()} w-[calc(100vw-2rem)] max-w-2xl sm:top-4 sm:px-5 sm:py-4 sm:rounded-xl sm:max-w-lg sm:cursor-default cursor-pointer"
    role="alert"
    onmouseenter={() => ui.setToastHovering(true)}
    onmouseleave={() => ui.setToastHovering(false)}
    onclick={handleClick}
  >
    <svelte:component this={getIcon()} class="h-5 w-5 text-white shrink-0 mt-0.5 sm:h-6 sm:w-6" />
    <span class="text-sm font-medium text-white leading-snug flex-1 sm:text-base">{ui.toastMessage}</span>
    <button
      class="hidden sm:flex text-white/70 hover:text-white transition-colors shrink-0 ml-2"
      onclick={(e) => { e.stopPropagation(); handleClick(); }}
      aria-label="Close notification"
    >
      <X class="h-4 w-4 sm:h-5 sm:w-5" />
    </button>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-in-from-top-4 {
    from {
      transform: translateY(-1rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
