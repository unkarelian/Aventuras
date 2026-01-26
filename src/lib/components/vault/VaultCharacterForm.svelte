<script lang="ts">
  import type { VaultCharacter } from "$lib/types";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import { X, User, Users, ImageUp, Loader2 } from "lucide-svelte";
  import { normalizeImageDataUrl } from "$lib/utils/image";
  import TagInput from "$lib/components/tags/TagInput.svelte";
  import { cn } from "$lib/utils/cn";

  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";

  interface Props {
    character?: VaultCharacter | null;
    onClose: () => void;
    onSaved?: (character: VaultCharacter) => void;
  }

  let { character = null, onClose, onSaved }: Props = $props();

  // Form state
  let name = $state(character?.name ?? "");
  let description = $state(character?.description ?? "");
  let traits = $state(character?.traits.join(", ") ?? "");
  let visualDescriptors = $state(character?.visualDescriptors.join(", ") ?? "");
  let tags = $state<string[]>(character?.tags ?? []);
  let portrait = $state<string | null>(character?.portrait ?? null);

  let saving = $state(false);
  let error = $state<string | null>(null);
  let uploadingPortrait = $state(false);

  const isEditing = $derived(!!character);

  async function handleSubmit() {
    if (!name.trim()) {
      error = "Name is required";
      return;
    }

    saving = true;
    error = null;

    try {
      const traitsArray = traits
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const visualDescriptorsArray = visualDescriptors
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      if (isEditing && character) {
        // Update existing
        await characterVault.update(character.id, {
          name: name.trim(),
          description: description.trim() || null,
          traits: traitsArray,
          visualDescriptors: visualDescriptorsArray,
          tags,
          portrait,
        });
        onSaved?.(characterVault.getById(character.id)!);
      } else {
        // Create new
        const newCharacter = await characterVault.add({
          name: name.trim(),
          description: description.trim() || null,
          traits: traitsArray,
          visualDescriptors: visualDescriptorsArray,
          tags,
          portrait,
          favorite: false,
          source: "manual",
          originalStoryId: null,
          metadata: null,
        });
        onSaved?.(newCharacter);
      }
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save character";
    } finally {
      saving = false;
    }
  }

  function handlePortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      error = "Please select an image file";
      return;
    }

    uploadingPortrait = true;
    const reader = new FileReader();
    reader.onload = (e) => {
      portrait = e.target?.result as string;
      uploadingPortrait = false;
    };
    reader.onerror = () => {
      error = "Failed to read image file";
      uploadingPortrait = false;
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function removePortrait() {
    portrait = null;
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <ResponsiveModal.Content
    class="md:max-w-150 flex flex-col md:h-auto md:max-h-[90vh]"
  >
    <ResponsiveModal.Header
      title={isEditing ? "Edit Character" : "New Character"}
    />

    <div class="flex-1 overflow-y-auto px-4 sm:pr-4">
      <form
        id="character-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        class="space-y-4 py-2"
      >
        {#if error}
          <div
            class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        {/if}

        <!-- Name -->
        <div class="space-y-2">
          <Label for="name">Name *</Label>
          <Input
            id="name"
            type="text"
            bind:value={name}
            placeholder="Character name"
          />
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
          <p class="text-[0.8rem] text-muted-foreground">
            Comma-separated personality traits
          </p>
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
          <p class="text-[0.8rem] text-muted-foreground">
            Used for portrait generation
          </p>
        </div>

        <!-- Portrait -->
        <div class="space-y-2">
          <Label>Portrait</Label>
          <div class="flex items-start gap-4">
            {#if portrait}
              <div class="relative group">
                <img
                  src={normalizeImageDataUrl(portrait) ?? ""}
                  alt="Portrait preview"
                  class="h-20 w-20 rounded-md object-cover ring-1 ring-border"
                />
                <button
                  type="button"
                  class="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  onclick={removePortrait}
                >
                  <X class="h-3 w-3" />
                </button>
              </div>
            {:else}
              <div
                class="flex h-20 w-20 items-center justify-center rounded-md bg-muted ring-1 ring-border"
              >
                <User class="h-8 w-8 text-muted-foreground" />
              </div>
            {/if}

            <div class="flex-1">
              <Button
                variant="outline"
                class="w-full relative cursor-pointer"
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
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
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
          <p class="text-[0.8rem] text-muted-foreground">
            For organizing your vault
          </p>
        </div>
      </form>
    </div>

    <!-- Actions -->
    <ResponsiveModal.Footer class="gap-2 sm:gap-0">
      <Button
        type="submit"
        form="character-form"
        disabled={saving || !name.trim()}
        class="w-full"
      >
        {#if saving}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        {isEditing ? "Save Changes" : "Create Character"}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
