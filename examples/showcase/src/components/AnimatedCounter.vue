<script setup lang="ts">defineProps<{value:number;suffix?:string}>();</script>
<template><strong class="counter">{{ value }}{{ suffix }}</strong></template>
<style scoped>.counter{font-size:4em;background:linear-gradient(90deg,#a78bfa,#818cf8);background-clip:text;color:transparent}</style>
