export interface ProjectTemplate {
  name: string;
  label: string;
  description?: string;
  files: Record<string, string>;
}

const BLANK: ProjectTemplate = {
  name: "blank",
  label: "Blank presentation",
  description: "A single title frame to get started.",
  files: {
    "presentation.rtex": `\\documentclass{reveal}
\\title{Untitled}
\\author{You}
\\date{\\today}
\\begin{document}
\\maketitle
\\begin{frame}{Hello}
Write your content here.
\\end{frame}
\\end{document}
`,
    "revealtex.config.ts": `import { defineConfig } from "revealtex";
export default defineConfig({});
`
  }
};

const MINIMAL: ProjectTemplate = {
  name: "minimal",
  label: "Minimal with component",
  description: "Two frames, a list, math, and a sample Vue component.",
  files: {
    "presentation.rtex": `\\documentclass{reveal}
\\title{Minimal Deck}
\\subtitle{A starting point}
\\author{RevealTeX}
\\date{\\today}
\\theme{moon}
\\begin{document}
\\maketitle
\\begin{frame}{Hello}
Welcome to RevealTeX.
\\begin{itemize}
\\item<1-> Author in LaTeX
\\item<2-> Present in reveal.js
\\end{itemize}
\\Metric[value=94.7,label={Accuracy}]
\\end{frame}
\\begin{frame}{Math}
\\[ E = mc^2 \\]
\\end{frame}
\\end{document}
`,
    "revealtex.config.ts": `import { defineConfig } from "revealtex";
export default defineConfig({
  components: { autoDiscover: "./src/components" }
});
`,
    "src/components/Metric.vue": `<script setup lang="ts">
defineProps<{ value: number; label: string }>();
</script>
<template><div class="metric"><strong>{{ value }}</strong><span>{{ label }}</span></div></template>
<style scoped>.metric{display:grid;gap:.2em;text-align:center}.metric strong{font-size:2em;color:#8b5cf6}.metric span{color:#94a3b8}</style>
`
  }
};

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [BLANK, MINIMAL];

export function findTemplate(templates: ProjectTemplate[], name: string): ProjectTemplate | undefined {
  return templates.find(template => template.name === name);
}
