<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const props = defineProps<{ id: string; transition?: string; transitionSpeed?: string; autoAnimate?: boolean; center?: boolean; backgroundColor?: string; backgroundImage?: string; backgroundGradient?: string }>();
</script>
<template><section :id="props.id" :data-transition="props.transition" :data-transition-speed="props.transitionSpeed" :data-auto-animate="props.autoAnimate || undefined" :data-background-color="props.backgroundColor" :data-background-image="props.backgroundImage" :data-background-gradient="props.backgroundGradient" :class="{ 'rt-center': props.center }" v-bind="$attrs"><slot /></section></template>
