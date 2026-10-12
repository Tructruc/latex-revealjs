import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createStudioServer, type BuildEvent, type StudioServer } from "../src/index.js";

const servers: StudioServer[] = [];
const sockets: WebSocket[] = [];
const roots = new Set<string>();

async function start(): Promise<{ server: StudioServer; base: string; ws: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "revealtex-studio-"));
  roots.add(root);
  const server = createStudioServer({ projectsRoot: root, port: 0 });
  const { url } = await server.listen();
  servers.push(server);
  return { server, base: url.replace(/\/$/, ""), ws: url.replace(/^http/, "ws").replace(/\/$/, ""), root };
}

async function createProject(base: string, name = "talk", template = "blank"): Promise<void> {
  const response = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, template }) });
  expect(response.status).toBe(201);
}

async function writeFile(base: string, id: string, path: string, content: string): Promise<void> {
  const response = await fetch(`${base}/api/projects/${id}/file`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content }) });
  expect(response.ok).toBe(true);
}

function nextBuild(socket: WebSocket, timeout = 8000): Promise<BuildEvent> {
  return new Promise((resolveBuild, rejectBuild) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); rejectBuild(new Error("Timed out waiting for build event.")); }, timeout);
    function onMessage(data: WebSocket.RawData): void {
      const event = JSON.parse(String(data)) as BuildEvent;
      if (event.type !== "build") return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolveBuild(event);
    }
    socket.on("message", onMessage);
  });
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await Promise.all(servers.splice(0).map(server => server.close()));
  await Promise.all([...roots].map(root => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("studio server", () => {
  it("creates, lists, and reads projects", async () => {
    const { base } = await start();
    await createProject(base, "My Talk", "blank");
    const list = await (await fetch(`${base}/api/projects`)).json() as Array<{ id: string }>;
    expect(list.map(project => project.id)).toContain("my-talk");
    const tree = await (await fetch(`${base}/api/projects/my-talk/tree`)).json() as Array<{ path: string }>;
    expect(tree.some(node => node.path === "presentation.rtex")).toBe(true);
  });

  it("lists built-in templates", async () => {
    const { base } = await start();
    const templates = await (await fetch(`${base}/api/templates`)).json() as Array<{ name: string }>;
    expect(templates.map(template => template.name)).toEqual(expect.arrayContaining(["blank", "minimal"]));
  });

  it("writes, uploads, reads, moves, and deletes files", async () => {
    const { base } = await start();
    await createProject(base);
    await writeFile(base, "talk", "slides/extra.rtex", "hello");
    expect(await (await fetch(`${base}/api/projects/talk/file?path=slides/extra.rtex`)).text()).toBe("hello");

    await fetch(`${base}/api/projects/talk/binary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "assets/logo.svg", data: Buffer.from("<svg/>").toString("base64") }) });
    await fetch(`${base}/api/projects/talk/file`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "slides/extra.rtex", to: "slides/renamed.rtex" }) });
    expect(await (await fetch(`${base}/api/projects/talk/file?path=slides/renamed.rtex`)).text()).toBe("hello");

    await fetch(`${base}/api/projects/talk/file?path=slides/renamed.rtex`, { method: "DELETE" });
    expect((await fetch(`${base}/api/projects/talk/file?path=slides/renamed.rtex`)).status).toBe(404);
  });

  it("rejects path traversal", async () => {
    const { base } = await start();
    await createProject(base);
    expect((await fetch(`${base}/api/projects/talk/file?path=../../etc/passwd`)).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${base}/api/projects/bad..id/tree`)).status).toBeGreaterThanOrEqual(400);
  });

  it("compiles a project and returns diagnostics", async () => {
    const { base } = await start();
    await createProject(base);
    const result = await (await fetch(`${base}/api/projects/talk/compile`)).json() as { hasErrors: boolean; rendererName: string };
    expect(result.hasErrors).toBe(false);
    expect(result.rendererName).toBe("vue");
  });

  it("surfaces semantic diagnostics with project-relative locations", async () => {
    const { base } = await start();
    await createProject(base);
    await writeFile(base, "talk", "presentation.rtex", String.raw`\begin{document}\begin{frame}{X}\Nope\end{frame}\end{document}`);
    const result = await (await fetch(`${base}/api/projects/talk/compile`)).json() as { hasErrors: boolean; diagnostics: Array<{ code: string; location?: { file: string } }> };
    expect(result.hasErrors).toBe(true);
    const diagnostic = result.diagnostics.find(entry => entry.code === "RTX3000");
    expect(diagnostic?.location?.file).toBe("presentation.rtex");
  });

  it("starts a Vue preview that serves a page", async () => {
    const { base } = await start();
    await createProject(base);
    const result = await (await fetch(`${base}/api/projects/talk/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json() as { preview?: { kind: string; url: string } };
    expect(result.preview?.kind).toBe("vue");
    const page = await fetch(result.preview!.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="app">');
  }, 20_000);

  it("starts an HTML preview from a config that selects the html renderer", async () => {
    const { base } = await start();
    await createProject(base);
    await writeFile(base, "talk", "revealtex.config.ts", `export default { renderer: "html" };\n`);
    const result = await (await fetch(`${base}/api/projects/talk/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json() as { preview?: { kind: string; url: string } };
    expect(result.preview?.kind).toBe("html");
    const page = await fetch(`${base}${result.preview!.url}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("reveal.js");
  });

  it("recompiles and broadcasts over WebSocket when a file changes", async () => {
    const { base, ws } = await start();
    await createProject(base);
    const socket = new WebSocket(`${ws}/api/events?project=talk`);
    sockets.push(socket);
    await new Promise<void>((resolveOpen, rejectOpen) => { socket.once("open", () => resolveOpen()); socket.once("error", rejectOpen); });

    const initial = await nextBuild(socket);
    expect(initial.hasErrors).toBe(false);

    const pending = nextBuild(socket);
    await writeFile(base, "talk", "presentation.rtex", String.raw`\begin{document}\begin{frame}{Changed}Updated\end{frame}\end{document}`);
    const rebuild = await pending;
    expect(rebuild.hasErrors).toBe(false);
    expect(rebuild.preview?.kind).toBe("vue");
  }, 20_000);

  it("honours a renderer override over WebSocket", async () => {
    const { base, ws } = await start();
    await createProject(base);
    const socket = new WebSocket(`${ws}/api/events?project=talk&renderer=html`);
    sockets.push(socket);
    await new Promise<void>((resolveOpen, rejectOpen) => { socket.once("open", () => resolveOpen()); socket.once("error", rejectOpen); });
    const initial = await nextBuild(socket);
    expect(initial.rendererName).toBe("html");

    const pending = nextBuild(socket);
    await writeFile(base, "talk", "presentation.rtex", String.raw`\begin{document}\begin{frame}{Changed}Updated\end{frame}\end{document}`);
    const rebuild = await pending;
    expect(rebuild.rendererName).toBe("html");
    expect(rebuild.preview?.kind).toBe("html");
  }, 20_000);

  it("saves a project as a user template", async () => {
    const root = await mkdtemp(join(tmpdir(), "revealtex-studio-tpl-"));
    roots.add(root);
    const server = createStudioServer({ projectsRoot: join(root, "projects"), templatesDirectory: join(root, "templates"), port: 0 });
    const { url } = await server.listen();
    servers.push(server);
    const base = url.replace(/\/$/, "");
    await createProject(base, "talk");
    const response = await fetch(`${base}/api/projects/talk/template`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "My Template" }) });
    expect(response.status).toBe(201);
    const templates = await (await fetch(`${base}/api/templates`)).json() as Array<{ name: string }>;
    expect(templates.map(template => template.name)).toContain("my-template");
  });

  it("exposes editor completions", async () => {
    const { base } = await start();
    const data = await (await fetch(`${base}/api/completions`)).json() as { commands: Array<{ name: string }>; environments: Array<{ name: string }> };
    expect(data.commands.map(item => item.name)).toEqual(expect.arrayContaining(["fragment", "image", "note"]));
    expect(data.environments.map(item => item.name)).toEqual(expect.arrayContaining(["frame", "columns", "itemize"]));
  });

  it("refreshes the HTML preview after an edit", async () => {
    const { base, ws } = await start();
    await createProject(base);
    await writeFile(base, "talk", "revealtex.config.ts", `export default { renderer: "html" };\n`);
    const socket = new WebSocket(`${ws}/api/events?project=talk&renderer=html`);
    sockets.push(socket);
    await new Promise<void>((resolveOpen, rejectOpen) => { socket.once("open", () => resolveOpen()); socket.once("error", rejectOpen); });
    await nextBuild(socket);

    const pending = nextBuild(socket);
    await writeFile(base, "talk", "presentation.rtex", String.raw`\begin{document}\begin{frame}{Alpha}One\end{frame}\end{document}`);
    const rebuild = await pending;
    expect(rebuild.preview?.kind).toBe("html");
    const html = await (await fetch(`${base}${rebuild.preview!.url}`)).text();
    expect(html).toContain("Alpha");
  }, 20_000);

  it("returns 404 for a missing project", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/projects/missing/compile`)).status).toBe(404);
  });

  it("serves the built web app when a web directory is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "revealtex-studio-web-"));
    roots.add(root);
    const web = join(root, "web");
    await import("node:fs/promises").then(fs => fs.mkdir(web, { recursive: true }).then(() => fs.writeFile(join(web, "index.html"), "<!doctype html><title>Studio</title>")));
    const server = createStudioServer({ projectsRoot: join(root, "projects"), studioWebDir: web, port: 0 });
    const { url } = await server.listen();
    servers.push(server);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Studio");
    expect(await readFile(join(root, "web", "index.html"), "utf8")).toContain("Studio");
  });
});
