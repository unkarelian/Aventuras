<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    label: string;
    onclick?: (e: MouseEvent) => void;
    mobileLabel?: string;
    variant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
    mobileVariant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
    size?: "default" | "sm" | "lg" | "icon";
    class?: string;
    iconClass?: string;
    title?: string;
  }

  let {
    icon: Icon,
    label,
    onclick,
    mobileLabel,
    variant = "outline",
    mobileVariant,
    size = "default",
    class: className = "h-10 w-10 sm:w-auto sm:h-10 sm:px-4",
    iconClass,
    title,
  }: Props = $props();

  let finalMobileVariant = $derived(mobileVariant ?? variant);

  // Determine icon size based on button size if not overridden
  let defaultIconClass = $derived.by(() => {
    if (iconClass) return iconClass;
    return "h-4 w-4";
  });

  let mobileIconClass = $derived(iconClass ?? "h-5 w-5");
</script>

<!-- Mobile Button -->
<Button
  variant={finalMobileVariant}
  {size}
  class="sm:hidden {className}"
  {onclick}
  title={title ?? label}
>
  <Icon class={mobileIconClass} />
  {#if mobileLabel}
    <span>{mobileLabel}</span>
  {/if}
</Button>

<!-- Desktop Button -->
<Button
  {variant}
  {size}
  class="hidden sm:inline-flex items-center gap-2 {className}"
  {onclick}
  title={title ?? label}
>
  <Icon class={defaultIconClass} />
  <span>{label}</span>
</Button>
