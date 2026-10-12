import { rm } from "node:fs/promises";
import { join } from "node:path";
import { commitGeneratedOutput, standaloneFiles } from "@revealtex/core";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import type { StudioBuild } from "./build.js";

export interface PreviewInfo { kind: string; url: string }

interface ActivePreview { id: string; kind: string; url: string; server?: ViteDevServer }

/**
 * Starts and manages live previews. The preview engine is pluggable: the Vue
 * renderer uses an embedded Vite dev server (HMR), the HTML renderer uses a
 * static directory served by the studio. Additional renderer packages can add
 * their own strategy here.
 */
export class PreviewManager {
  private readonly active = new Map<string, ActivePreview>();
  constructor(private readonly workspace: string) {}

  staticDirFor(id: string): string { return join(this.workspace, id); }

  async update(build: StudioBuild): Promise<PreviewInfo> {
    const existing = this.active.get(build.id);
    if (existing && existing.kind !== build.rendererName) await this.dispose(build.id);
    return build.rendererName === "html" ? this.updateHtml(build) : this.updateVue(build);
  }

  private async writeOutput(build: StudioBuild, dir: string, standalone: boolean): Promise<void> {
    await rm(dir, { recursive: true, force: true });
    const files = [...build.files];
    if (standalone) files.push(...standaloneFiles(build.config));
    await commitGeneratedOutput(dir, files);
  }

  private async updateVue(build: StudioBuild): Promise<PreviewInfo> {
    const dir = this.staticDirFor(build.id);
    await this.writeOutput(build, dir, true);
    let current = this.active.get(build.id);
    if (!current?.server) {
      const server = await createServer({
        root: dir,
        configFile: false,
        plugins: [vue()],
        optimizeDeps: { exclude: ["@revealtex/runtime-vue"] },
        server: { host: "127.0.0.1", port: 0, strictPort: false }
      });
      await server.listen();
      const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
      current = { id: build.id, kind: "vue", url, server };
      this.active.set(build.id, current);
    }
    return { kind: "vue", url: current.url };
  }

  private async updateHtml(build: StudioBuild): Promise<PreviewInfo> {
    const dir = this.staticDirFor(build.id);
    await this.writeOutput(build, dir, false);
    const url = `/preview-files/${encodeURIComponent(build.id)}/index.html`;
    this.active.set(build.id, { id: build.id, kind: "html", url });
    return { kind: "html", url };
  }

  async dispose(id: string): Promise<void> {
    const current = this.active.get(id);
    if (current?.server) await current.server.close();
    this.active.delete(id);
  }

  async disposeAll(): Promise<void> { await Promise.all([...this.active.keys()].map(id => this.dispose(id))); }
}
