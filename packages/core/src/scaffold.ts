import type { RevealTeXConfig } from "@revealtex/compiler";
import type { GeneratedFile } from "@revealtex/renderer-core";

/** Files that turn a generated Vue presentation into a runnable standalone Vite app. */
export function standaloneFiles(config: RevealTeXConfig): GeneratedFile[] {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ private: true, type: "module", scripts: { dev: "vite", build: "vite build" }, dependencies: { "@revealtex/runtime-vue": "^0.1.0", vue: "^3.5.0", "reveal.js": "^5.1.0" }, devDependencies: { "@vitejs/plugin-vue": "^5.2.0", vite: "^6.0.0", typescript: "^5.7.0" } }, null, 2) + "\n",
    "index.html": '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><link rel="icon" href="data:,"><title>RevealTeX</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n',
    "src/main.ts": 'import { createApp } from "vue";\nimport "reveal.js/dist/reveal.css";\nimport "@revealtex/runtime-vue/theme.css";\nimport "@revealtex/runtime-vue/animations.css";\nimport "./style.css";\nimport Presentation from "../Presentation.generated.vue";\ncreateApp(Presentation).mount("#app");\n',
    "src/style.css": "html, body, #app { width: 100%; height: 100%; margin: 0; }\nbody { overflow: hidden; }\n",
    "vite.config.ts": 'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\nexport default defineConfig({ plugins: [vue()] });\n'
  };
  if (config.theme?.css) files["src/revealtex-theme.css"] = `@import ${JSON.stringify(config.theme.css)};\n`;
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}
