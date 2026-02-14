<script lang="ts">
  import type { VaultLorebook } from '$lib/types'
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { cn } from '$lib/utils/cn'
  import VaultLorebookEditorContent from './VaultLorebookEditorContent.svelte'

  interface Props {
    lorebook: VaultLorebook
    onClose: () => void
  }

  let { lorebook, onClose }: Props = $props()

  // Manage maximization state at the modal level
  let isMaximized = $state(false)

  async function handleSave(updated: VaultLorebook) {
    await lorebookVault.update(updated.id, updated)
  }

  async function handleSaveAndClose(updated: VaultLorebook) {
    await lorebookVault.update(updated.id, updated)
    onClose()
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose()
  }}
>
  <ResponsiveModal.Content
    class={cn(
      'flex h-[100dvh] w-full flex-col overflow-hidden rounded-none p-0 transition-all duration-200 sm:h-[90vh] sm:rounded-lg',
      isMaximized ? 'max-w-[90vw]' : 'sm:max-w-6xl',
    )}
  >
    <VaultLorebookEditorContent
      {lorebook}
      onSave={handleSave}
      onSaveAndClose={handleSaveAndClose}
      {onClose}
      initialEntryIndex={null}
    />
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
