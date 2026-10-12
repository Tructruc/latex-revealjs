import { defineStore } from "pinia";
import { api, type BuildResponse, type Diagnostic, type FileNode, type ProjectSummary, type TemplateSummary } from "./api";

export interface OpenFile { path: string; content: string; saved: string; dirty: boolean }

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStudio = defineStore("studio", {
  state: () => ({
    projects: [] as ProjectSummary[],
    templates: [] as TemplateSummary[],
    activeId: "",
    tree: [] as FileNode[],
    openFiles: [] as OpenFile[],
    activePath: "",
    diagnostics: [] as Diagnostic[],
    hasErrors: false,
    rendererName: "vue",
    rendererOverride: "" as string,
    previewUrl: "",
    previewKind: "",
    revision: 0,
    status: "idle" as "idle" | "loading" | "connected" | "ready" | "error",
    error: "",
    socket: null as WebSocket | null
  }),
  getters: {
    activeFile(state): OpenFile | undefined { return state.openFiles.find(file => file.path === state.activePath); },
    activeProject(state): ProjectSummary | undefined { return state.projects.find(project => project.id === state.activeId); }
  },
  actions: {
    async init() {
      try { this.templates = await api.templates(); await this.loadProjects(); }
      catch (error) { this.fail(error); }
    },
    async loadProjects() {
      this.projects = await api.listProjects();
      if (!this.activeId && this.projects[0]) await this.selectProject(this.projects[0].id);
    },
    async createProject(name: string, template: string) {
      const project = await api.createProject(name, template);
      this.projects = await api.listProjects();
      await this.selectProject(project.id);
    },
    async deleteProject(id: string) {
      await api.deleteProject(id);
      if (this.activeId === id) { this.activeId = ""; this.openFiles = []; this.activePath = ""; this.previewUrl = ""; this.socket?.close(); }
      await this.loadProjects();
    },
    async selectProject(id: string) {
      this.status = "loading";
      this.activeId = id;
      this.openFiles = [];
      this.activePath = "";
      this.diagnostics = [];
      this.hasErrors = false;
      this.previewUrl = "";
      await this.refreshTree();
      const main = flatten(this.tree).find(node => node.name.endsWith(".rtex"));
      if (main) await this.openFile(main.path);
      this.connect();
      await this.refreshPreview();
    },
    async refreshTree() {
      if (!this.activeId) return;
      this.tree = await api.tree(this.activeId);
    },
    async openFile(path: string) {
      if (!this.openFiles.some(file => file.path === path)) {
        const content = await api.readFile(this.activeId, path);
        this.openFiles.push({ path, content, saved: content, dirty: false });
      }
      this.activePath = path;
    },
    closeFile(path: string) {
      this.openFiles = this.openFiles.filter(file => file.path !== path);
      if (this.activePath === path) this.activePath = this.openFiles.at(-1)?.path ?? "";
    },
    updateContent(value: string) {
      const file = this.activeFile;
      if (!file) return;
      file.content = value;
      file.dirty = value !== file.saved;
      this.scheduleSave();
    },
    scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void this.saveActive(), 500);
    },
    async saveActive() {
      const file = this.activeFile;
      if (!file || !file.dirty) return;
      await api.writeFile(this.activeId, file.path, file.content);
      file.saved = file.content;
      file.dirty = false;
    },
    async createFile(path: string) {
      await api.createFile(this.activeId, path);
      await this.refreshTree();
      await this.openFile(path);
    },
    async deleteFile(path: string) {
      await api.deleteFile(this.activeId, path);
      this.closeFile(path);
      await this.refreshTree();
    },
    async renameFile(from: string, to: string) {
      await api.renameFile(this.activeId, from, to);
      const file = this.openFiles.find(candidate => candidate.path === from);
      if (file) file.path = to;
      if (this.activePath === from) this.activePath = to;
      await this.refreshTree();
    },
    async saveAsTemplate(name: string) {
      await api.saveTemplate(this.activeId, name);
      this.templates = await api.templates();
    },
    async uploadFiles(files: FileList) {
      for (const file of Array.from(files)) {
        const data = await readAsBase64(file);
        await api.uploadBinary(this.activeId, `assets/${file.name}`, data);
      }
      await this.refreshTree();
    },
    async refreshPreview() {
      if (!this.activeId) return;
      try { this.applyBuild(await api.preview(this.activeId, this.rendererOverride || undefined)); }
      catch (error) { this.fail(error); }
    },
    async setRenderer(renderer: string) {
      this.rendererOverride = renderer;
      this.previewUrl = "";
      this.connect();
      await this.refreshPreview();
    },
    connect() {
      this.socket?.close();
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const renderer = this.rendererOverride ? `&renderer=${encodeURIComponent(this.rendererOverride)}` : "";
      const socket = new WebSocket(`${protocol}://${location.host}/api/events?project=${encodeURIComponent(this.activeId)}${renderer}`);
      socket.onopen = () => { this.status = "connected"; };
      socket.onmessage = event => { try { this.applyBuild(JSON.parse(event.data) as BuildResponse); } catch { /* ignore */ } };
      socket.onclose = () => { if (this.status !== "error") this.status = "idle"; };
      this.socket = socket;
    },
    applyBuild(build: BuildResponse) {
      this.diagnostics = build.diagnostics ?? [];
      this.hasErrors = build.hasErrors;
      this.rendererName = build.rendererName;
      if (build.preview) {
        this.previewKind = build.preview.kind;
        this.previewUrl = build.preview.url;
        this.revision++;
      }
      this.status = "ready";
    },
    fail(error: unknown) {
      this.error = error instanceof Error ? error.message : String(error);
      this.status = "error";
    },
    clearError() { this.error = ""; }
  }
});

function flatten(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap(node => node.type === "directory" ? flatten(node.children ?? []) : [node]);
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new FileReader();
    reader.onload = () => resolveRead(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => rejectRead(reader.error);
    reader.readAsDataURL(file);
  });
}
