<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ url: string; kind: string; revision: number }>();
const src = computed(() => props.url ? (props.kind === "html" ? `${props.url}${props.url.includes("#") ? "" : `#${props.revision}`}` : props.url) : "");
</script>

<template>
  <div class="preview">
    <div class="head">
      <strong>Preview</strong>
      <span class="badge">{{ kind || "—" }}</span>
      <span class="spacer" style="flex: 1" />
      <a :href="url" target="_blank" rel="noopener" style="color: #c4b5fd" v-if="url">Open in new tab</a>
    </div>
    <iframe v-if="src" :src="src" title="Preview" />
    <div v-else class="placeholder">Select a project to start a live preview.</div>
  </div>
</template>
