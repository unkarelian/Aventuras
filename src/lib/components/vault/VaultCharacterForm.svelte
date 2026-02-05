<script lang="ts">
  import type { VaultCharacter } from '$lib/types'
  import { descriptorsToString, stringToDescriptors } from '$lib/utils/visualDescriptors'
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import { X, User, ImageUp, Loader2 } from 'lucide-svelte'
  import { normalizeImageDataUrl } from '$lib/utils/image'
  import TagInput from '$lib/components/tags/TagInput.svelte'

  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'

  interface Props {
    character?: VaultCharacter | null
    onClose: () => void
    onSaved?: (character: VaultCharacter) => void
  }

  let { character = null, onClose, onSaved }: Props = $props()

  // Form state
  let name = $derived(character?.name ?? '')
  let description = $derived(character?.description ?? '')
  let traits = $derived(character?.traits.join(', ') ?? '')
  let visualDescriptors = $derived(
    character ? descriptorsToString(character.visualDescriptors) : '',
  )
  let tags = $derived<string[]>(character?.tags ?? [])
  let portrait = $derived<string | null>(character?.portrait ?? null)

  let saving = $state(false)
  let error = $state<string | null>(null)
  let uploadingPortrait = $state(false)

  const isEditing = $derived(!!character)

  async function handleSubmit() {
    if (!name.trim()) {
      error = 'Name is required'
      return
    }

    saving = true
    error = null

    try {
      const traitsArray = traits
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const visualDescriptorsObj = stringToDescriptors(visualDescriptors)

      if (isEditing && character) {
        // Update existing
        await characterVault.update(character.id, {
          name: name.trim(),
          description: description.trim() || null,
          traits: traitsArray,
          visualDescriptors: visualDescriptorsObj,
          tags,
          portrait,
        })
        onSaved?.(characterVault.getById(character.id)!)
      } else {
        // Create new
        const newCharacter = await characterVault.add({
          name: name.trim(),
          description: description.trim() || null,
          traits: traitsArray,
          visualDescriptors: visualDescriptorsObj,
          tags,
          portrait,
          favorite: false,
          source: 'manual',
          originalStoryId: null,
          metadata: null,
        })
        onSaved?.(newCharacter)
      }
      onClose()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save character'
    } finally {
      saving = false
    }
  }

  function handlePortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      error = 'Please select an image file'
      return
    }

    uploadingPortrait = true
    const reader = new FileReader()
    reader.onload = (e) => {
      portrait = e.target?.result as string
      uploadingPortrait = false
    }
    reader.onerror = () => {
      error = 'Failed to read image file'
      uploadingPortrait = false
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  function removePortrait() {
    portrait = null
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose()
  }}
>
  <ResponsiveModal.Content class="flex flex-col md:h-auto md:max-h-[90vh] md:max-w-150">
    <ResponsiveModal.Header title={isEditing ? 'Edit Character' : 'New Character'} />

    <div class="flex-1 overflow-y-auto px-4 sm:pr-4">
      <form
        id="character-form"
        onsubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        class="space-y-4 py-2"
      >
        {#if error}
          <div
            class="bg-destructive/10 border-destructive/20 text-destructive rounded-md border p-3 text-sm"
          >
            {error}
          </div>
        {/if}

        <!-- Name -->
        <div class="space-y-2">
          <Label for="name">Name *</Label>
          <Input id="name" type="text" bind:value={name} placeholder="Character name" />
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <Label for="description">Description</Label>
          <Textarea
            id="description"
            bind:value={description}
            placeholder="Brief description of character"
            rows={3}
            class="resize-none"
          />
        </div>

        <!-- Traits -->
        <div class="space-y-2">
          <Label for="traits">Traits</Label>
          <Input
            id="traits"
            type="text"
            bind:value={traits}
            placeholder="Brave, Curious, Stubborn (comma-separated)"
          />
          <p class="text-muted-foreground text-[0.8rem]">Comma-separated personality traits</p>
        </div>

        <!-- Visual Descriptors -->
        <div class="space-y-2">
          <Label for="visualDescriptors">Visual Descriptors</Label>
          <Input
            id="visualDescriptors"
            type="text"
            bind:value={visualDescriptors}
            placeholder="Tall, dark hair, blue eyes (comma-separated)"
          />
          <p class="text-muted-foreground text-[0.8rem]">Used for portrait generation</p>
        </div>

        <!-- Portrait -->
        <div class="space-y-2">
          <Label>Portrait</Label>
          <div class="flex items-start gap-4">
            {#if portrait}
              <div class="group relative">
                <img
                  src={normalizeImageDataUrl(portrait) ?? ''}
                  alt="Portrait preview"
                  class="ring-border h-20 w-20 rounded-md object-cover ring-1"
                />
                <button
                  type="button"
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90 absolute -top-2 -right-2 rounded-full p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  onclick={removePortrait}
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
            {:else}
              <div
                class="bg-muted ring-border flex h-20 w-20 items-center justify-center rounded-md ring-1"
              >
                <User class="text-muted-foreground h-8 w-8" />
              </div>
            {/if}

            <div class="flex-1">
              <Button
                variant="outline"
                class="relative w-full cursor-pointer"
                disabled={uploadingPortrait}
              >
                {#if uploadingPortrait}
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {:else}
                  <ImageUp class="mr-2 h-4 w-4" />
                {/if}
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  onchange={handlePortraitUpload}
                  disabled={uploadingPortrait}
                />
              </Button>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div class="space-y-2">
          <Label for="tags">Tags</Label>
          <TagInput
            value={tags}
            type="character"
            onChange={(newTags) => (tags = newTags)}
            placeholder="Add tags..."
          />
          <p class="text-muted-foreground text-[0.8rem]">For organizing your vault</p>
        </div>
      </form>
    </div>

    <!-- Actions -->
    <ResponsiveModal.Footer class="gap-2 sm:gap-0">
      <Button type="submit" form="character-form" disabled={saving || !name.trim()} class="w-full">
        {#if saving}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        {isEditing ? 'Save Changes' : 'Create Character'}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
