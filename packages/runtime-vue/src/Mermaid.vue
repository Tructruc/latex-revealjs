<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ code: string; kind?: string }>(), { kind: "mermaid" });
const svg = ref("");
const error = ref(false);
let loader: Promise<any> | undefined;
let counter = 0;

const load = () => {
  loader ??= import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  return loader;
};

const render = async () => {
  try {
    const mod = await load();
    const mermaid = mod.default ?? mod;
    mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
    const id = `rt-mermaid-${Date.now()}-${counter++}`;
    const result = await mermaid.render(id, props.code);
    svg.value = result.svg ?? result;
    error.value = false;
  } catch {
    error.value = true;
    svg.value = "";
  }
};

onMounted(render);
watch(() => props.code, render);
</script>
<template>
  <div class="rt-diagram rt-diagram--mermaid">
    <div v-if="svg" class="rt-diagram__svg" v-html="svg" />
    <pre v-else class="rt-diagram__fallback">{{ code }}</pre>
  </div>
</template>
