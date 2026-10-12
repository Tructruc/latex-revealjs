<script setup lang="ts">
import { computed } from "vue";
import type { FileNode } from "../api";

const props = defineProps<{ tree: FileNode[]; active: string }>();
const emit = defineEmits<{ (event: "open", path: string): void }>();

interface Row { node: FileNode; depth: number }
function collect(nodes: FileNode[], depth = 0): Row[] {
  return nodes.flatMap(node => [{ node, depth }, ...(node.children ? collect(node.children, depth + 1) : [])]);
}
const rows = computed(() => collect(props.tree));

function icon(node: FileNode): string {
  if (node.type === "directory") return "▸";
  if (node.name.endsWith(".rtex")) return "◆";
  if (node.name.endsWith(".vue")) return "▣";
  if (node.name.endsWith(".css")) return "▤";
  if (/\.(png|jpe?g|svg|gif|webp)$/i.test(node.name)) return "▦";
  return "·";
}
</script>

<template>
  <div class="tree">
    <div
      v-for="row in rows"
      :key="row.node.path"
      class="row"
      :class="{ active: row.node.path === active, dir: row.node.type === 'directory' }"
      :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
      @click="row.node.type === 'file' && emit('open', row.node.path)"
    >
      <span class="icon">{{ icon(row.node) }}</span>
      <span>{{ row.node.name }}</span>
    </div>
    <p v-if="!rows.length" style="padding: 8px 12px; color: #64748b;">No files yet.</p>
  </div>
</template>
