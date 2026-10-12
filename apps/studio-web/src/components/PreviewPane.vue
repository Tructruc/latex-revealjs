<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ url: string; kind: string; revision: number }>();
const manual = ref(0);
const src = computed(() => {
  if (!props.url) return "";
  const separator = props.url.includes("?") ? "&" : "?";
  return `${props.url}${separator}rt=${props.revision}-${manual.value}`;
});
</script>

<template>
  <div class="preview">
    <div class="panel-head">
      <span class="panel-title">Preview</span>
      <span class="pill">{{ kind || "—" }}</span>
      <span class="grow" />
      <button class="ghost" title="Reload" @click="manual++">Reload</button>
      <a v-if="url" class="ghost" :href="url" target="_blank" rel="noopener">Open</a>
    </div>
    <iframe v-if="src" :src="src" title="Preview" />
    <div v-else class="placeholder">
      <p>No live preview yet.</p>
      <p>Select a project to start one.</p>
    </div>
  </div>
</template>
