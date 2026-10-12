<script setup lang="ts">
import type { Diagnostic } from "../api";

defineProps<{ diagnostics: Diagnostic[] }>();
const emit = defineEmits<{ (event: "open", payload: { file: string; line: number }): void }>();

function open(diagnostic: Diagnostic): void {
  if (diagnostic.location) emit("open", { file: diagnostic.location.file, line: diagnostic.location.start.line });
}
function where(diagnostic: Diagnostic): string {
  return diagnostic.location ? `${diagnostic.location.file}:${diagnostic.location.start.line}` : "";
}
</script>

<template>
  <div class="problems">
    <div class="panel-head">
      <span class="panel-title">Problems</span>
      <span class="pill" :class="diagnostics.some(d => d.severity === 'error') ? 'bad' : 'ok'">{{ diagnostics.length }}</span>
    </div>
    <div class="list">
      <div v-for="(diagnostic, index) in diagnostics" :key="index" class="problem" :class="diagnostic.severity" @click="open(diagnostic)">
        <span class="sev">{{ diagnostic.severity }}</span>
        <span class="code">{{ diagnostic.code }}</span>
        <span class="msg">{{ diagnostic.message }}<span v-if="diagnostic.location" class="where"> {{ where(diagnostic) }}</span></span>
      </div>
      <div v-if="!diagnostics.length" class="empty">No problems detected.</div>
    </div>
  </div>
</template>
