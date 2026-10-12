<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createEditor, type EditorHandle } from "../editor/setup";
import { useStudio, type OpenFile } from "../store";

const props = defineProps<{ file?: OpenFile }>();
const emit = defineEmits<{ (event: "update", value: string): void; (event: "save"): void }>();

const studio = useStudio();
const host = ref<HTMLElement | null>(null);
let handle: EditorHandle | undefined;

function mount(): void {
  if (!host.value || !props.file) return;
  handle?.destroy();
  handle = createEditor(host.value, {
    doc: props.file.content,
    filename: props.file.path,
    getCompletions: () => studio.completions,
    onChange: value => emit("update", value),
    onSave: () => emit("save")
  });
}

onMounted(mount);
onBeforeUnmount(() => handle?.destroy());
watch(() => props.file?.path, mount);
defineExpose({ goTo: (line: number) => handle?.goToLine(line) });
</script>

<template>
  <div ref="host" class="editor-host" />
</template>
