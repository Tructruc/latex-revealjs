<script setup lang="ts">
import { computed } from "vue";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useRevealContext } from "./reveal-context";
const props = defineProps<{ tex: string; display?: boolean }>();
const { mathMacros } = useRevealContext();
const macros = computed(() => Object.fromEntries(Object.entries(mathMacros).map(([name, expansion]) => [name.startsWith("\\") ? name : `\\${name}`, expansion])));
const html = computed(() => katex.renderToString(props.tex, { displayMode: props.display, throwOnError: false, strict: "warn", output: "htmlAndMathml", macros: macros.value }));
</script>
<template><component :is="display ? 'div' : 'span'" class="rt-math" :data-tex="tex" v-html="html" /></template>
