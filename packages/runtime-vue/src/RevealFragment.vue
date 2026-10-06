<script setup lang="ts">defineProps<{ effect?: string; index?: number }>();</script>
<template><div class="fragment" :class="effect" :data-fragment-index="index"><slot /></div></template>
