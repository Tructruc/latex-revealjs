<script setup lang="ts">defineProps<{value:number;label:string;suffix?:string;trend?:number}>();</script>
<template><article class="metric"><strong>{{ value }}{{ suffix }}</strong><span>{{ label }}</span><small v-if="trend !== undefined">{{ trend > 0 ? '+' : '' }}{{ trend }}%</small></article></template>
<style scoped>.metric{padding:1.4rem;border:1px solid #ffffff20;border-radius:1rem;background:#ffffff0b;display:grid;gap:.35rem}.metric strong{font-size:2em}.metric span{color:#94a3b8}.metric small{color:#a78bfa}</style>
