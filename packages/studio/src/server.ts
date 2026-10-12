import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Diagnostic } from "@revealtex/compiler";
import chokidar, { type FSWatcher } from "chokidar";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { buildProject, type StudioBuild } from "./build.js";
import { PreviewManager } from "./preview.js";
import { ProjectStore, StudioError } from "./projects.js";

export interface StudioServerOptions {
  /** Directory where projects live. */
  projectsRoot: string;
  /** Optional directory of user-provided templates. */
  templatesDirectory?: string;
  /** Built studio-web SPA directory to serve. */
  studioWebDir?: string;
  host?: string;
  port?: number;
}

export interface BuildEvent {
  type: "build";
  id: string;
  rendererName: string;
  hasErrors: boolean;
  diagnostics: Diagnostic[];
  sourceFiles: string[];
  preview?: { kind: string; url: string };
}

export interface StudioServer {
  app: express.Express;
  store: ProjectStore;
  preview: PreviewManager;
  listen(): Promise<{ host: string; port: number; url: string }>;
  close(): Promise<void>;
}

interface WatchState { watcher: FSWatcher; clients: Set<WebSocket>; timer?: ReturnType<typeof setTimeout>; building: boolean; queued: boolean; renderer?: string }

export function createStudioServer(options: StudioServerOptions): StudioServer {
  const store = new ProjectStore({ root: options.projectsRoot, templatesDirectory: options.templatesDirectory });
  const workspace = join(store.root, ".studio", "preview");
  const preview = new PreviewManager(workspace);
  const app = express();
  const watchers = new Map<string, WatchState>();
  const host = options.host ?? "127.0.0.1";
  let httpServer: HttpServer | undefined;

  app.use(express.json({ limit: "32mb" }));

  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  app.get("/api/templates", asyncHandler(async (_req, res) => {
    const templates = await store.templates();
    res.json(templates.map(template => ({ name: template.name, label: template.label, description: template.description })));
  }));
  app.get("/api/projects", asyncHandler(async (_req, res) => { res.json(await store.list()); }));
  app.post("/api/projects", asyncHandler(async (req, res) => {
    const { name, template } = req.body ?? {};
    res.status(201).json(await store.create(String(name ?? "untitled"), template ? String(template) : undefined));
  }));
  app.get("/api/projects/:id", asyncHandler(async (req, res) => {
    if (!(await store.exists(req.params.id))) throw new StudioError(404, "Project not found.");
    res.json({ id: req.params.id, name: req.params.id, mainFile: store.mainFile });
  }));
  app.delete("/api/projects/:id", asyncHandler(async (req, res) => {
    await closeWatcher(req.params.id);
    await preview.dispose(req.params.id);
    await store.remove(req.params.id);
    res.json({ ok: true });
  }));
  app.get("/api/projects/:id/tree", asyncHandler(async (req, res) => { res.json(await store.tree(req.params.id)); }));
  app.get("/api/projects/:id/file", asyncHandler(async (req, res) => {
    res.type("text/plain").send(await store.read(req.params.id, String(req.query.path ?? "")));
  }));
  app.put("/api/projects/:id/file", asyncHandler(async (req, res) => {
    await store.write(req.params.id, String(req.body?.path ?? ""), String(req.body?.content ?? ""));
    res.json({ ok: true });
  }));
  app.post("/api/projects/:id/file", asyncHandler(async (req, res) => {
    await store.write(req.params.id, String(req.body?.path ?? ""), String(req.body?.content ?? ""));
    res.status(201).json({ ok: true });
  }));
  app.post("/api/projects/:id/binary", asyncHandler(async (req, res) => {
    await store.writeBinary(req.params.id, String(req.body?.path ?? ""), String(req.body?.data ?? ""));
    res.status(201).json({ ok: true });
  }));
  app.patch("/api/projects/:id/file", asyncHandler(async (req, res) => {
    await store.move(req.params.id, String(req.body?.from ?? ""), String(req.body?.to ?? ""));
    res.json({ ok: true });
  }));
  app.delete("/api/projects/:id/file", asyncHandler(async (req, res) => {
    await store.removeFile(req.params.id, String(req.query.path ?? ""));
    res.json({ ok: true });
  }));
  app.get("/api/projects/:id/compile", asyncHandler(async (req, res) => {
    res.json(toBuildResponse(await buildProject(store, req.params.id, rendererOverride(req))));
  }));
  app.post("/api/projects/:id/preview", asyncHandler(async (req, res) => {
    const build = await buildProject(store, req.params.id, rendererOverride(req));
    const info = build.hasErrors ? undefined : await preview.update(build);
    res.json({ ...toBuildResponse(build), preview: info });
  }));

  app.use("/preview-files", express.static(workspace, { fallthrough: true }));

  if (options.studioWebDir) {
    const indexHtml = join(options.studioWebDir, "index.html");
    app.use(express.static(options.studioWebDir, { fallthrough: true }));
    app.get(/^(?!\/api\/).*/, asyncHandler(async (_req, res) => { res.type("html").send(await readFile(indexHtml, "utf8")); }));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof StudioError ? error.status : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
  });

  function rendererOverride(req: Request): string | undefined {
    const value = req.query.renderer ?? (req.body as { renderer?: unknown } | undefined)?.renderer;
    return value ? String(value) : undefined;
  }

  function relativize(id: string, file: string): string {
    const dir = store.projectDir(id);
    return file.startsWith(dir + "/") ? store.relative(id, file) : file;
  }

  function toBuildResponse(build: StudioBuild): Omit<BuildEvent, "type" | "preview"> {
    const diagnostics = build.diagnostics.map(diagnostic => diagnostic.location ? { ...diagnostic, location: { ...diagnostic.location, file: relativize(build.id, diagnostic.location.file) } } : diagnostic);
    return { id: build.id, rendererName: build.rendererName, hasErrors: build.hasErrors, diagnostics, sourceFiles: build.sourceFiles.map(file => relativize(build.id, file)) };
  }

  async function broadcast(id: string, build: StudioBuild): Promise<void> {
    const state = watchers.get(id);
    if (!state) return;
    const info = build.hasErrors ? undefined : await preview.update(build).catch(() => undefined);
    const event: BuildEvent = { type: "build", ...toBuildResponse(build), preview: info ? { kind: info.kind, url: info.url } : undefined };
    const payload = JSON.stringify(event);
    for (const client of state.clients) if (client.readyState === client.OPEN) client.send(payload);
  }

  async function rebuild(id: string): Promise<void> {
    const state = watchers.get(id);
    if (!state) return;
    if (state.building) { state.queued = true; return; }
    state.building = true;
    try { await broadcast(id, await buildProject(store, id, state.renderer)); }
    catch { /* diagnostics surface on the next successful build */ }
    finally { state.building = false; if (state.queued) { state.queued = false; void rebuild(id); } }
  }

  async function subscribe(id: string, client: WebSocket, renderer?: string): Promise<void> {
    if (!(await store.exists(id))) { client.close(4404, "Project not found."); return; }
    let state = watchers.get(id);
    if (!state) {
      const dir = store.projectDir(id);
      const watcher = chokidar.watch(dir, { ignoreInitial: true, ignored: [/[/\\]\.studio([/\\]|$)/, "**/node_modules/**", "**/.git/**", "**/generated/**"] });
      const created: WatchState = { watcher, clients: new Set(), building: false, queued: false };
      watcher.on("all", () => { clearTimeout(created.timer); created.timer = setTimeout(() => void rebuild(id), 120); });
      watchers.set(id, created);
      state = created;
    }
    state.renderer = renderer;
    state.clients.add(client);
    client.on("close", () => { void unsubscribe(id, client); });
    try { client.send(JSON.stringify({ type: "build", ...toBuildResponse(await buildProject(store, id, renderer)) } satisfies BuildEvent)); } catch { /* ignore */ }
  }

  async function unsubscribe(id: string, client: WebSocket): Promise<void> {
    const state = watchers.get(id);
    if (!state) return;
    state.clients.delete(client);
    if (state.clients.size === 0) await closeWatcher(id);
  }

  async function closeWatcher(id: string): Promise<void> {
    const state = watchers.get(id);
    if (!state) return;
    clearTimeout(state.timer);
    await state.watcher.close();
    watchers.delete(id);
  }

  return {
    app,
    store,
    preview,
    async listen() {
      await store.init();
      httpServer = createHttpServer(app);
      const wss = new WebSocketServer({ noServer: true });
      httpServer.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/events") { socket.destroy(); return; }
        const id = url.searchParams.get("project") ?? "";
        const renderer = url.searchParams.get("renderer") ?? undefined;
        wss.handleUpgrade(request, socket, head, client => void subscribe(id, client, renderer));
      });
      const port = options.port ?? 4400;
      await new Promise<void>((resolveListen, rejectListen) => {
        httpServer!.once("error", rejectListen);
        httpServer!.listen(port, host, () => resolveListen());
      });
      const address = httpServer.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      return { host, port: actualPort, url: `http://${host}:${actualPort}/` };
    },
    async close() {
      await Promise.all([...watchers.keys()].map(id => closeWatcher(id)));
      await preview.disposeAll();
      if (httpServer) await new Promise<void>(resolveClose => httpServer!.close(() => resolveClose()));
    }
  };
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => { handler(req, res).catch(next); };
}
