<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { BookOpen, Users, MapPin, Package, Shield, Lightbulb, Calendar } from 'lucide-svelte';
  
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Badge } from '$lib/components/ui/badge';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { cn } from '$lib/utils/cn';

  const tierLabels: Record<number, string> = {
    1: 'Always Active',
    2: 'Keyword Matched',
    3: 'LLM Selected',
  };

  const tierDescriptions: Record<number, string> = {
    1: 'State-based or always-inject entries',
    2: 'Matched by name, alias, or keyword',
    3: 'Contextually relevant (AI selected)',
  };

  // Modern colors compatible with light/dark modes
  const tierColors: Record<number, string> = {
    1: 'text-green-600 dark:text-green-400 border-green-500/20 bg-green-500/5',
    2: 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/5',
    3: 'text-purple-600 dark:text-purple-400 border-purple-500/20 bg-purple-500/5',
  };

  const tierIndicatorColors: Record<number, string> = {
    1: 'bg-green-500',
    2: 'bg-amber-500',
    3: 'bg-purple-500',
  };

  const typeIcons: Record<string, typeof Users> = {
    character: Users,
    location: MapPin,
    item: Package,
    faction: Shield,
    concept: Lightbulb,
    event: Calendar,
  };

  function getIcon(type: string) {
    return typeIcons[type] || BookOpen;
  }
</script>

<ResponsiveModal.Root bind:open={ui.lorebookDebugOpen}>
  <ResponsiveModal.Content class="max-w-2xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
    <ResponsiveModal.Header class="px-6 py-4 border-b shrink-0" title="Active Lorebook Entries" />

    <ScrollArea class="flex-1 min-h-0">
        <div class="p-6 space-y-6">
            {#if ui.lastLorebookRetrieval}
                {@const result = ui.lastLorebookRetrieval}
                {@const totalCount = result.tier1.length + result.tier2.length + result.tier3.length}

                <!-- Summary Card -->
                <Card class="bg-muted/40 shadow-sm">
                    <CardContent class="p-4">
                         <div class="flex items-center justify-between text-sm mb-4">
                            <span class="text-muted-foreground font-medium">Total Active Entries</span>
                            <span class="font-mono font-bold text-foreground bg-background px-2.5 py-0.5 rounded border">{totalCount}</span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                             <Badge variant="outline" class="border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/5 hover:bg-green-500/10 transition-colors">Tier 1: {result.tier1.length}</Badge>
                             <Badge variant="outline" class="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">Tier 2: {result.tier2.length}</Badge>
                             <Badge variant="outline" class="border-purple-500/40 text-purple-700 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/10 transition-colors">Tier 3: {result.tier3.length}</Badge>
                        </div>
                    </CardContent>
                </Card>

                {#if totalCount === 0}
                    <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <BookOpen class="h-12 w-12 opacity-10 mb-4" />
                        <p class="font-medium">No active entries</p>
                        <p class="text-sm mt-1 opacity-70">Generate a response to populate the lorebook.</p>
                    </div>
                {:else}
                    <!-- Tier Sections -->
                    {#each [1, 2, 3] as tier}
                        {@const tierEntries = tier === 1 ? result.tier1 : tier === 2 ? result.tier2 : result.tier3}
                         {#if tierEntries.length > 0}
                            <div class="space-y-3">
                                <div class="flex items-center gap-2">
                                     <div class={cn("w-2.5 h-2.5 rounded-full shadow-sm", tierIndicatorColors[tier as 1|2|3])}></div>
                                     <h3 class="font-semibold text-sm">Tier {tier}: {tierLabels[tier as 1|2|3]} <span class="text-muted-foreground font-normal ml-1">({tierEntries.length})</span></h3>
                                </div>
                                <p class="text-xs text-muted-foreground pl-5">{tierDescriptions[tier as 1|2|3]}</p>
                                
                                <div class="grid gap-3">
                                    {#each tierEntries as retrieved}
                                        {@const Icon = getIcon(retrieved.entry.type)}
                                        <Card class={cn("overflow-hidden transition-all hover:shadow-md", tierColors[tier as 1|2|3])}>
                                            <CardContent class="p-3.5 flex items-start gap-3.5">
                                                <div class="mt-0.5 p-1.5 rounded-md bg-background/60 backdrop-blur-sm shrink-0 border border-transparent shadow-sm">
                                                    <Icon class="h-4 w-4" />
                                                </div>
                                                <div class="flex-1 min-w-0 space-y-1.5">
                                                     <div class="flex items-center gap-2 justify-between">
                                                         <span class="font-semibold text-sm truncate">{retrieved.entry.name}</span>
                                                         <Badge variant="secondary" class="text-[10px] px-1.5 h-5 font-medium tracking-wide uppercase bg-background/60 hover:bg-background/90">{retrieved.entry.type}</Badge>
                                                     </div>
                                                     {#if retrieved.matchReason}
                                                         <div class="text-xs bg-background/40 rounded px-2 py-1 inline-block border border-black/5 dark:border-white/5">
                                                            <span class="opacity-70 font-medium">Match:</span> {retrieved.matchReason.replace(/^matched:\s*/i, '')}
                                                         </div>
                                                     {/if}
                                                     <p class="text-xs opacity-80 line-clamp-2 leading-relaxed">
                                                         {retrieved.entry.description}
                                                     </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    {/each}
                                </div>
                            </div>
                         {/if}
                    {/each}
                {/if}

                <!-- Context Block Preview -->
                {#if result.contextBlock}
                    <Separator class="my-6" />
                    <div class="space-y-3">
                        <h3 class="text-sm font-medium flex items-center gap-2 text-foreground/80">
                            <Package class="h-4 w-4" />
                            Injected Context Block
                        </h3>
                         <div class="relative rounded-lg border bg-muted/30">
                            <ScrollArea class="h-48 w-full rounded-lg">
                                <div class="p-4">
                                    <pre class="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">{result.contextBlock}</pre>
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                {/if}

            {:else}
                <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                     <div class="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                        <BookOpen class="h-10 w-10 opacity-20" />
                     </div>
                     <p class="font-semibold text-lg">No Data Available</p>
                     <p class="text-sm mt-2 opacity-70 max-w-xs text-center">Generate a story response to see active lorebook entries populated here.</p>
                </div>
            {/if}
        </div>
    </ScrollArea>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
