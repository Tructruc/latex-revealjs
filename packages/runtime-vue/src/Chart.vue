<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ config: string; type?: string }>(), { type: "bar" });
const canvas = ref<HTMLCanvasElement | null>(null);
let instance: { destroy(): void } | undefined;
let loader: Promise<any> | undefined;

const load = (): Promise<any> => {
  const existing = (window as any).Chart;
  if (existing) return Promise.resolve(existing);
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    script.onload = () => resolve((window as any).Chart);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loader;
};

const render = async () => {
  if (!canvas.value) return;
  try {
    const mod = await load();
    const Chart = mod.default ?? mod;
    instance?.destroy();
    instance = new Chart(canvas.value, { type: props.type || "bar", data: JSON.parse(props.config), options: { responsive: true, maintainAspectRatio: false } });
  } catch {
    /* leave the canvas empty if chart.js cannot be loaded */
  }
};

onMounted(render);
watch(() => [props.type, props.config], render);
onBeforeUnmount(() => instance?.destroy());
</script>
<template>
  <div class="rt-chart"><canvas ref="canvas" /></div>
</template>
