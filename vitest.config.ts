import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  resolve: { alias: {
    "@revealtex/compiler": fileURLToPath(new URL("./packages/compiler/src/index.ts", import.meta.url)),
    "@revealtex/renderer-core": fileURLToPath(new URL("./packages/renderer-core/src/index.ts", import.meta.url))
  } },
  test: { include: ["packages/*/tests/**/*.test.ts"] }
});
