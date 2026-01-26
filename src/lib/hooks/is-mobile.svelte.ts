import { onMount } from 'svelte';

export function createIsMobile() {
	let isMobile = $state(false);

	onMount(() => {
		const mql = window.matchMedia('(max-width: 768px)');
		
		const onChange = () => {
			isMobile = mql.matches;
		};

		mql.addEventListener('change', onChange);
		isMobile = mql.matches;

		return () => mql.removeEventListener('change', onChange);
	});

	return {
		get current() {
			return isMobile;
		}
	};
}
