import { computed, inject, onScopeDispose, type InjectionKey, type Ref } from "vue";

export type RevealEventName = "ready" | "slidechanged" | "fragmentshown" | "fragmenthidden" | "overviewshown" | "overviewhidden" | "paused" | "resumed";
export type RevealEvent = Record<string, unknown> & { currentSlide?: HTMLElement; previousSlide?: HTMLElement; fragment?: Element };
export type RevealEventListener = (event: RevealEvent) => void;
export interface RevealContext {
  deck: Ref<any>;
  ready: Ref<boolean>;
  currentSlide: Ref<HTMLElement | null>;
  /** Current Beamer-style overlay number (1 is the initial state). */
  currentOverlay: Ref<number>;
  fragmentState: Ref<{ shown: Element[]; hidden: Element[] }>;
  mathMacros: Readonly<Record<string, string>>;
  subscribe(event: RevealEventName, listener: RevealEventListener): () => void;
}
export const revealContextKey: InjectionKey<RevealContext> = Symbol("RevealTeX context");
export function useRevealContext() { const context = inject(revealContextKey); if (!context) throw new Error("useRevealContext must be used inside RevealDeck."); return { ...context, isCurrentSlide: (element: Ref<HTMLElement | null>) => computed(() => element.value?.closest("section") === context.currentSlide.value) }; }
export function usePresentationLifecycle() {
  const context = useRevealContext();
  const on = (event: RevealEventName, listener: RevealEventListener) => { const stop = context.subscribe(event, listener); onScopeDispose(stop); return stop; };
  return {
    ...context,
    on,
    onReady: (listener: RevealEventListener) => on("ready", listener),
    onPresentationReady: (listener: RevealEventListener) => on("ready", listener),
    onSlideChange: (listener: RevealEventListener) => on("slidechanged", listener),
    onSlideEnter: (listener: RevealEventListener) => on("slidechanged", listener),
    onSlideLeave: (listener: RevealEventListener) => on("slidechanged", listener),
    onFragmentShow: (listener: RevealEventListener) => on("fragmentshown", listener),
    onFragmentHide: (listener: RevealEventListener) => on("fragmenthidden", listener)
  };
}
