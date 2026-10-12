import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const api = process.env.STUDIO_API ?? "http://127.0.0.1:4400";

export default defineConfig({
  plugins: [vue()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 4401,
    proxy: {
      "/api": { target: api, changeOrigin: true, ws: true },
      "/preview-files": { target: api, changeOrigin: true }
    }
  }
});
