<script setup lang="ts">
import { ref } from "vue";
import { usePresentationLifecycle } from "@revealtex/runtime-vue";

const status = ref("waiting for Reveal");
const { ready, onPresentationReady, onSlideEnter, onFragmentShow, onFragmentHide } = usePresentationLifecycle();
if (ready.value) status.value = "presentation ready";
onPresentationReady(() => status.value = "presentation ready");
onSlideEnter(() => status.value = "slide event received");
onFragmentShow(() => status.value = "fragment shown");
onFragmentHide(() => status.value = "fragment hidden");
</script>

<template><small class="lifecycle-probe" data-testid="lifecycle-probe">{{ status }}</small></template>

<style scoped>
.lifecycle-probe { position: absolute; right: 1rem; bottom: .5rem; color: #94a3b8; font-size: .32em; letter-spacing: .08em; text-transform: uppercase; }
</style>
