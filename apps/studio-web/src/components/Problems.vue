<script setup lang="ts">
import type { Diagnostic } from "../api";

defineProps<{ diagnostics: Diagnostic[] }>();
const emit = defineEmits<{ (event: "open", payload: { file: string; line: number }): void }>();

function open(diagnostic: Diagnostic): void {
  if (diagnostic.location) emit("open", { file: diagnostic.location.file, line: diagnostic.location.start.line });
}
</script>

<template>
  <div class="problems">
    <div v-if="!diagnostics.length" style="padding: 8px 12px; color: #64748b;">No problems.</div>
    <div
      v-for="(diagnostic, index) in diagnostics"
      :key="index"
      class="diagnostic"
      :class="diagnostic.severity"
      @click="open(diagnostic)"
    >
      <span class="sev">{{ diagnostic.severity }}</span>
      <span class="loc">{{ diagnostic.code }}</span>
      <span>{{ diagnostic.message }}<em v-if="diagnostic.location"> — {{ diagnostic.location.file }}:{{ diagnostic.location.start.line }}</em></span>
    </div>
  </div>
</template>
