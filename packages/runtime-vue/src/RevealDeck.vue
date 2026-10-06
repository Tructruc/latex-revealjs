<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import Reveal from "reveal.js";
import RevealNotesPlugin from "reveal.js/plugin/notes/notes.esm.js";
import RevealHighlightPlugin from "reveal.js/plugin/highlight/highlight.esm.js";
import RevealSearchPlugin from "reveal.js/plugin/search/search.esm.js";
import RevealZoomPlugin from "reveal.js/plugin/zoom/zoom.esm.js";
import "reveal.js/plugin/highlight/monokai.css";
import { revealContextKey, type RevealEvent, type RevealEventListener, type RevealEventName } from "./reveal-context";
import { applyOverlayVisibility, currentOverlayNumber } from "./overlays";

const props = withDefaults(defineProps<{ options?: Record<string, unknown>; plugins?: unknown[]; mathMacros?: Record<string, string> }>(), { options: () => ({}), plugins: () => [], mathMacros: () => ({}) });
const emit = defineEmits<{ (event: RevealEventName, payload: RevealEvent): void }>();
const root = ref<HTMLElement | null>(null);
const deck = ref<any>();
const ready = ref(false);
const currentSlide = ref<HTMLElement | null>(null);
const currentOverlay = ref(1);
const fragmentState = ref({ shown: [] as Element[], hidden: [] as Element[] });
let overlayScheduled = false;
const scheduleOverlaySync = () => {
  if (overlayScheduled) return;
  overlayScheduled = true;
  setTimeout(() => { overlayScheduled = false; syncOverlays(); }, 0);
};
const syncOverlays = () => {
  const slide = deck.value?.getCurrentSlide?.() as HTMLElement | undefined;
  if (!slide) return;
  const overlay = currentOverlayNumber(slide);
  currentOverlay.value = overlay;
  applyOverlayVisibility(root.value, overlay);
};
const listeners = new Map<RevealEventName, Set<RevealEventListener>>();
const subscribe = (event: RevealEventName, listener: RevealEventListener) => { const set = listeners.get(event) ?? new Set<RevealEventListener>(); set.add(listener); listeners.set(event, set); return () => set.delete(listener); };
const publish = (event: RevealEventName, payload: RevealEvent) => { emit(event, payload); listeners.get(event)?.forEach(listener => listener(payload)); };
const revealEvents: RevealEventName[] = ["ready", "slidechanged", "fragmentshown", "fragmenthidden", "overviewshown", "overviewhidden", "paused", "resumed"];
provide(revealContextKey, { deck, ready, currentSlide, currentOverlay, fragmentState, mathMacros: props.mathMacros, subscribe });

let overlayObserver: MutationObserver | undefined;
onMounted(async () => {
  if (!root.value) return;
  overlayObserver = new MutationObserver(() => scheduleOverlaySync());
  overlayObserver.observe(root.value, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const plugins = [RevealNotesPlugin, RevealHighlightPlugin, RevealSearchPlugin, RevealZoomPlugin, ...props.plugins].filter((plugin, index, all) => all.indexOf(plugin) === index);
  deck.value = new Reveal(root.value, { ...props.options, plugins });
  revealEvents.forEach(name => deck.value.on(name, (event: RevealEvent) => {
    if (event.currentSlide) currentSlide.value = event.currentSlide;
    if (name === "ready") ready.value = true;
    if (name === "fragmentshown" && event.fragment) fragmentState.value = { shown: [...new Set([...fragmentState.value.shown, event.fragment])], hidden: fragmentState.value.hidden.filter(item => item !== event.fragment) };
    if (name === "fragmenthidden" && event.fragment) fragmentState.value = { shown: fragmentState.value.shown.filter(item => item !== event.fragment), hidden: [...new Set([...fragmentState.value.hidden, event.fragment])] };
    publish(name, event);
    scheduleOverlaySync();
  }));
  await deck.value.initialize();
  currentSlide.value = deck.value.getCurrentSlide();
  syncOverlays();
  ready.value = true;
});
onBeforeUnmount(() => { overlayObserver?.disconnect(); overlayObserver = undefined; deck.value?.destroy(); deck.value = undefined; ready.value = false; listeners.clear(); });
</script>
<template><div ref="root" class="reveal"><div class="slides"><slot /></div></div></template>
