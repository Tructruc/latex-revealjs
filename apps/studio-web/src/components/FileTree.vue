<script setup lang="ts">
import { computed, ref } from "vue";
import type { FileNode } from "../api";

const props = defineProps<{ tree: FileNode[]; active: string }>();
const emit = defineEmits<{ (event: "open", path: string): void; (event: "delete", path: string): void; (event: "rename", path: string): void }>();

const collapsed = ref<Set<string>>(new Set());
function toggle(path: string): void {
  const next = new Set(collapsed.value);
  if (next.has(path)) next.delete(path); else next.add(path);
  collapsed.value = next;
}

interface Row { node: FileNode; depth: number }
function collect(nodes: FileNode[], depth = 0): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.type === "directory" && !collapsed.value.has(node.path) && node.children) rows.push(...collect(node.children, depth + 1));
  }
  return rows;
}
const rows = computed(() => collect(props.tree));

function icon(node: FileNode): string {
  if (node.type === "directory") return "▸";
  if (node.name.endsWith(".rtex")) return "◆";
  if (node.name.endsWith(".vue")) return "▣";
  if (node.name.endsWith(".ts") || node.name.endsWith(".js")) return "⬡";
  if (node.name.endsWith(".css")) return "▤";
  if (/\.(png|jpe?g|svg|gif|webp)$/i.test(node.name)) return "▦";
  if (node.name.endsWith(".md")) return "▩";
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
      :style="{ paddingLeft: `${6 + row.depth * 14}px` }"
      @click="row.node.type === 'directory' ? toggle(row.node.path) : emit('open', row.node.path)"
    >
      <span v-if="row.node.type === 'directory'" class="chev" :class="{ closed: collapsed.has(row.node.path) }">▾</span>
      <span v-else class="chev" />
      <span class="icon">{{ icon(row.node) }}</span>
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis">{{ row.node.name }}</span>
      <template v-if="row.node.type === 'file'">
        <span class="close" title="Rename" @click.stop="emit('rename', row.node.path)">✎</span>
        <span class="close" title="Delete" @click.stop="emit('delete', row.node.path)">×</span>
      </template>
    </div>
    <p v-if="!rows.length" style="padding: 8px 12px; color: #5b6478;">No files yet.</p>
  </div>
</template>
