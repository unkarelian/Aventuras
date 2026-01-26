<script lang="ts">
  import {
    Archive,
    Loader2,
    FileJson,
    ChevronRight,
    AlertCircle,
    X,
    BookOpen,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import type { VaultLorebook } from "$lib/types";
  import type { ImportedLorebookItem, EntryType } from "../wizardTypes";
  import { getTypeCounts, getTypeColor } from "../wizardTypes";

  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Progress } from "$lib/components/ui/progress";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { cn } from "$lib/utils/cn";

  interface Props {
    importedLorebooks: ImportedLorebookItem[];
    importError: string | null;
    onSelectFromVault: (lorebook: VaultLorebook) => void;
    onRemoveLorebook: (id: string) => void;
    onToggleExpanded: (id: string) => void;
    onClearAll: () => void;
    onNavigateToVault: () => void;
  }

  let {
    importedLorebooks,
    importError,
    onSelectFromVault,
    onRemoveLorebook,
    onToggleExpanded,
    onClearAll,
    onNavigateToVault,
  }: Props = $props();

  // Get list of vault lorebook IDs that have been imported
  const importedVaultLorebookIds = $derived(
    importedLorebooks
      .map((lb) => lb.vaultId)
      .filter((id): id is string => !!id),
  );

  // Combined summary for display
  const importedEntries = $derived(
    importedLorebooks.flatMap((lb) => lb.entries),
  );

  const importSummary = $derived.by(() => {
    if (importedLorebooks.length === 0) return null;
    const entries = importedEntries;
    return {
      total: entries.length,
      withContent: entries.filter((e) => e.description?.trim()).length,
      byType: getTypeCounts(entries),
    };
  });
</script>

<!-- Header Section -->
<div class="space-y-1 mb-4">
  <div class="flex items-center gap-2">
    <div
      class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10"
    >
      <Archive class="h-4 w-4 text-primary" />
    </div>
    <h3 class="text-lg font-medium">Vault Lorebooks</h3>
  </div>
  <p class="text-sm text-muted-foreground">
    Select lorebooks from your vault to populate your world with characters,
    locations, and lore.
  </p>
</div>

<!-- Vault Browser -->
<div class="space-y-1">
  <div class="flex items-center justify-between pb-1">
    <h4
      class="text-sm font-medium text-muted-foreground flex items-center gap-2"
    >
      <BookOpen class="h-4 w-4" />
      Available in Vault
    </h4>
    <Button
      variant="link"
      size="sm"
      class="h-auto p-0 text-xs"
      onclick={onNavigateToVault}
    >
      Manage Vault
    </Button>
  </div>

  <UniversalVaultBrowser
    type="lorebook"
    onSelect={onSelectFromVault}
    {onNavigateToVault}
    disabledIds={importedVaultLorebookIds}
  />
</div>

{#if importError}
  <Alert.Root variant="destructive">
    <AlertCircle class="h-4 w-4" />
    <Alert.Title>Error</Alert.Title>
    <Alert.Description>{importError}</Alert.Description>
  </Alert.Root>
{/if}

<!-- Selected Lorebooks List -->
{#if importedLorebooks.length > 0}
  <div class="relative py-4">
    <div class="absolute inset-0 flex items-center" aria-hidden="true">
      <div class="w-full border-t"></div>
    </div>
    <div class="relative flex justify-center text-xs uppercase">
      <span class="bg-background px-2 text-muted-foreground"
        >Selected Items</span
      >
    </div>
  </div>

  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-foreground">
        Imported Lorebooks ({importedLorebooks.length})
      </h3>
      {#if importedLorebooks.length > 1}
        <Button
          variant="ghost"
          size="sm"
          onclick={onClearAll}
          class="h-8 text-muted-foreground hover:text-destructive"
        >
          Clear All
        </Button>
      {/if}
    </div>

    <div class="grid gap-3">
      {#each importedLorebooks as lorebook (lorebook.id)}
        <Collapsible.Root
          open={lorebook.expanded}
          onOpenChange={() => onToggleExpanded(lorebook.id)}
          class="group"
        >
          <Card.Root
            class={cn(
              "transition-all overflow-hidden border-muted-foreground/20 bg-muted/10",
              lorebook.isLoading && "animate-pulse",
            )}
          >
            <!-- Main Row -->
            <div class="flex items-center gap-3 p-2">
              <!-- Expand Toggle -->
              <Collapsible.Trigger
                class={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground",
                )}
                disabled={lorebook.isLoading}
              >
                <ChevronRight
                  class={cn(
                    "h-4 w-4 transition-transform duration-200",
                    lorebook.expanded && "rotate-90",
                  )}
                />
              </Collapsible.Trigger>

              <!-- Icon -->
              <div class="shrink-0 rounded-md bg-secondary p-2">
                {#if lorebook.isLoading}
                  <Loader2 class="h-4 w-4 text-primary animate-spin" />
                {:else}
                  <FileJson class="h-4 w-4 text-primary" />
                {/if}
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0 grid gap-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate text-sm">
                    {lorebook.filename.replace(" (from Vault)", "")}
                  </span>
                  {#if lorebook.result.warnings.length > 0 && !lorebook.isLoading}
                    <Badge
                      variant="outline"
                      class="border-amber-500/50 text-amber-600 dark:text-amber-500 text-[10px] px-1 py-0 h-5"
                    >
                      {lorebook.result.warnings.length} Warnings
                    </Badge>
                  {/if}
                </div>

                {#if lorebook.isLoading}
                  <div class="space-y-1.5">
                    <p
                      class="text-xs text-muted-foreground flex justify-between"
                    >
                      <span>{lorebook.loadingMessage || "Processing..."}</span>
                      {#if lorebook.classificationProgress}
                        <span
                          >{Math.round(
                            (lorebook.classificationProgress.current /
                              lorebook.classificationProgress.total) *
                              100,
                          )}%</span
                        >
                      {/if}
                    </p>
                    {#if lorebook.classificationProgress}
                      <Progress
                        value={(lorebook.classificationProgress.current /
                          lorebook.classificationProgress.total) *
                          100}
                        class="h-1.5"
                      />
                    {/if}
                  </div>
                {:else}
                  <div
                    class="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span>{lorebook.entries.length} entries</span>
                    {#if !lorebook.expanded}
                      <span class="text-muted-foreground/30">•</span>
                      <span class="truncate opacity-70">
                        {Object.entries(getTypeCounts(lorebook.entries))
                          .filter(([, c]) => c > 0)
                          .map(([t, c]) => `${c} ${t}`)
                          .join(", ")}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Remove Action -->
              {#if !lorebook.isLoading}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onclick={() => onRemoveLorebook(lorebook.id)}
                  title="Remove"
                >
                  <X class="h-4 w-4" />
                </Button>
              {/if}
            </div>

            <!-- Expanded Details -->
            <Collapsible.Content>
              <div class="border-t bg-muted/30 p-3">
                <!-- Stats Grid -->
                <div class="flex flex-wrap gap-2">
                  {#each Object.entries(getTypeCounts(lorebook.entries)) as [type, count]}
                    {#if count > 0}
                      <Badge
                        variant="outline"
                        class="bg-background/50 font-normal gap-2 px-2.5"
                      >
                        <span
                          class={cn(
                            "shrink-0",
                            getTypeColor(type as EntryType),
                          )}>●</span
                        >
                        <span class="capitalize truncate">{type}</span>
                        <span class="text-muted-foreground font-mono opacity-75"
                          >{count}</span
                        >
                      </Badge>
                    {/if}
                  {/each}
                </div>

                <div class="flex items-center justify-between pt-2 pb-1">
                  <h4
                    class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Preview
                  </h4>
                </div>

                <ScrollArea class="h-45 w-full rounded-md border bg-background">
                  <div class="p-2 space-y-1">
                    {#each lorebook.entries.slice(0, 10) as entry}
                      <div
                        class="flex items-center gap-2 text-sm p-2 rounded-sm hover:bg-muted/50 transition-colors"
                      >
                        <Badge
                          variant="outline"
                          class="text-[10px] px-1.5 h-5 font-normal shrink-0 bg-muted/20"
                        >
                          <span class={getTypeColor(entry.type)}
                            >{entry.type}</span
                          >
                        </Badge>
                        <span
                          class="truncate font-medium flex-1 text-xs sm:text-sm"
                        >
                          {entry.name}
                        </span>
                        {#if entry.keywords.length > 0}
                          <span
                            class="text-[10px] text-muted-foreground truncate max-w-100"
                          >
                            {entry.keywords.slice(0, 3).join(", ")}
                          </span>
                        {/if}
                      </div>
                    {/each}
                    {#if lorebook.entries.length > 10}
                      <div
                        class="py-2 text-center text-xs text-muted-foreground bg-muted/20"
                      >
                        + {lorebook.entries.length - 10} more entries
                      </div>
                    {/if}
                  </div>
                </ScrollArea>

                {#if lorebook.result.warnings.length > 0}
                  <Alert.Root variant="destructive" class="py-2">
                    <AlertCircle class="h-4 w-4" />
                    <Alert.Description class="text-xs">
                      {lorebook.result.warnings.length} warning(s) occurred during
                      import.
                      <ul class="mt-1 list-disc list-inside">
                        {#each lorebook.result.warnings.slice(0, 3) as warning}
                          <li>{warning}</li>
                        {/each}
                      </ul>
                    </Alert.Description>
                  </Alert.Root>
                {/if}
              </div>
            </Collapsible.Content>
          </Card.Root>
        </Collapsible.Root>
      {/each}
    </div>

    <!-- Summary Card -->
    {#if importedLorebooks.length > 1 && importSummary}
      <Card.Root class="bg-primary/5 border-primary/10 shadow-none">
        <Card.Content
          class="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div>
            <p class="font-medium text-foreground">Total Imported Content</p>
            <p class="text-xs text-muted-foreground">
              {importSummary.total} entries across {importedLorebooks.length} lorebooks
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each Object.entries(importSummary.byType) as [type, count]}
              {#if count > 0}
                <Badge variant="secondary" class="bg-background/80">
                  {type}: {count}
                </Badge>
              {/if}
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
{/if}
