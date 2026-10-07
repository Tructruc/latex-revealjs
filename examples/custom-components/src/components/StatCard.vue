<script setup lang="ts">
defineProps<{ value: number; label: string; trend?: number }>();
</script>
<template>
  <article class="stat-card">
    <strong>{{ value }}</strong>
    <span>{{ label }}</span>
    <em v-if="trend !== undefined" :class="trend >= 0 ? 'up' : 'down'">{{ trend >= 0 ? '+' : '' }}{{ trend }}%</em>
  </article>
</template>
<style scoped>
.stat-card { display:grid; gap:.2rem; min-width:5em; padding:.8rem 1rem; border:1px solid #ffffff22; border-radius:.6rem; background:#ffffff0d; text-align:center; }
.stat-card strong { font-size:2em; color:#8b5cf6; }
.stat-card span { color:#94a3b8; font-size:.5em; }
.stat-card em { font-style:normal; font-size:.55em; }
.stat-card em.up { color:#34d399; }
.stat-card em.down { color:#fb7185; }
</style>
