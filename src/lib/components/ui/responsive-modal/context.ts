import { setContext, getContext } from "svelte";

const RESPONSIVE_MODAL_CTX = "responsive-modal-ctx";

export interface ResponsiveModalContext {
    isMobile: { current: boolean };
}

export function setResponsiveModalContext(context: ResponsiveModalContext) {
    setContext(RESPONSIVE_MODAL_CTX, context);
}

export function getResponsiveModalContext() {
    return getContext<ResponsiveModalContext>(RESPONSIVE_MODAL_CTX);
}
