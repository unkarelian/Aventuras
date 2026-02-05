<script lang="ts">
  import '../app.css'
  import Toast from '$lib/components/Toast.svelte'

  let { children } = $props()
</script>

<div class="h-screen w-screen overflow-hidden">
  {@render children()}
</div>

<Toast />
