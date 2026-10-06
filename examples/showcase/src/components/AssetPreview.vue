<script setup lang="ts">
defineProps<{ source: string; label?: string }>();
</script>

<template>
  <figure class="asset-preview">
    <img :src="source" :alt="label ?? 'Imported presentation asset'" />
    <figcaption v-if="label">{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.asset-preview { margin: 1rem auto; max-width: 34rem; }
.asset-preview img { display: block; width: 100%; }
.asset-preview figcaption { margin-top: .45rem; color: #94a3b8; font-size: .55em; }
</style>
