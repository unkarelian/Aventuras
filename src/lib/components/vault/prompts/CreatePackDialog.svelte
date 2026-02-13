<script lang="ts">
  import type { PresetPack } from '$lib/services/packs/types'
  import { packService } from '$lib/services/packs/pack-service'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'

  interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (pack: PresetPack) => void
  }

  let { open, onOpenChange, onCreated }: Props = $props()

  let name = $state('')
  let description = $state('')
  let author = $state('')
  let creating = $state(false)

  let canCreate = $derived(name.trim().length > 0 && !creating)

  function resetForm() {
    name = ''
    description = ''
    author = ''
    creating = false
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      resetForm()
    }
    onOpenChange(value)
  }

  async function handleCreate() {
    if (!canCreate) return

    creating = true
    try {
      const pack = await packService.createPack(
        name.trim(),
        description.trim() || undefined,
        author.trim() || undefined,
      )
      resetForm()
      onCreated(pack)
      onOpenChange(false)
    } catch (error) {
      console.error('[CreatePackDialog] Failed to create pack:', error)
      creating = false
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Create Prompt Pack</Dialog.Title>
      <Dialog.Description>
        New packs start as a copy of the default templates. You can customize them after creation.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4">
      <div class="flex flex-col gap-2">
        <Label for="pack-name">Name <span class="text-destructive">*</span></Label>
        <Input
          id="pack-name"
          bind:value={name}
          placeholder="My Custom Pack"
        />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="pack-description">Description</Label>
        <Textarea
          id="pack-description"
          bind:value={description}
          placeholder="A brief description of this pack..."
          rows={3}
        />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="pack-author">Author</Label>
        <Input
          id="pack-author"
          bind:value={author}
          placeholder="Your name"
        />
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button onclick={handleCreate} disabled={!canCreate}>
        {#if creating}
          Creating...
        {:else}
          Create
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
