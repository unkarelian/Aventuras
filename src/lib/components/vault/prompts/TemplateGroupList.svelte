<script lang="ts">
  import { getTemplateGroups } from './templateGroups'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { ChevronRight, Variable } from 'lucide-svelte'
  import { cn } from '$lib/utils/cn'

  interface Props {
    packId: string
    selectedTemplateId: string | null
    showVariables: boolean
    onSelectTemplate: (templateId: string) => void
    onToggleVariables: () => void
  }

  let { packId, selectedTemplateId, showVariables, onSelectTemplate, onToggleVariables }: Props =
    $props()

  const groups = getTemplateGroups()
</script>

<ScrollArea class="h-full">
  <div class="flex flex-col py-2">
    <!-- Variables Tab -->
    <button
      type="button"
      class={cn(
        'mx-2 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        showVariables
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      onclick={onToggleVariables}
    >
      <Variable class="h-4 w-4" />
      Variables
    </button>

    <div class="mx-2 mb-2 border-b"></div>

    <!-- Template Groups -->
    {#each groups as group (group.name)}
      <Collapsible.Root class="px-2">
        <Collapsible.Trigger
          class="hover:bg-muted flex w-full items-center justify-between rounded-md px-3 py-2 transition-colors"
        >
          <span class="text-sm font-medium">{group.name}</span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{group.templates.length}</span>
            <ChevronRight
              class="text-muted-foreground h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90"
            />
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class="flex flex-col gap-0.5 pb-1 pl-2">
            {#each group.templates as template (template.id)}
              <button
                type="button"
                class={cn(
                  'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  selectedTemplateId === template.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onclick={() => onSelectTemplate(template.id)}
              >
                {template.name}
              </button>
            {/each}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    {/each}
  </div>
</ScrollArea>
