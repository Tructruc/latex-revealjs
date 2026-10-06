<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ code: string; language?: string; numbers?: boolean; highlight?: string | number | number[] }>();
const lineNumbers = computed(() => {
  const source = Array.isArray(props.highlight)
    ? props.highlight.join(",")
    : props.highlight === undefined || props.highlight === null
      ? ""
      : String(props.highlight);
  const value = source.replace(/\s+/g, "");
  if (value) return value;
  return props.numbers ? "" : undefined;
});
</script>
<template><pre class="rt-code"><code :class="language ? `language-${language}` : undefined" :data-line-numbers="lineNumbers">{{ code }}</code></pre></template>
