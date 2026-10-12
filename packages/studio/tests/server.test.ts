import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStudioServer, type StudioServer } from "../src/index.js";

const servers: StudioServer[] = [];
const roots = new Set<string>();

async function start(): Promise<{ server: StudioServer; base: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "revealtex-studio-"));
  roots.add(root);
  const server = createStudioServer({ projectsRoot: root, port: 0 });
  const { url } = await server.listen();
  servers.push(server);
  return { server, base: url.replace(/\/$/, ""), root };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
  await Promise.all([...roots].map(root => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("studio server", () => {
  it("creates, lists, and reads projects", async () => {
    const { base } = await start();
    const created = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "My Talk", template: "blank" }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: "my-talk" });

    const list = await (await fetch(`${base}/api/projects`)).json() as Array<{ id: string }>;
    expect(list.map(project => project.id)).toContain("my-talk");

    const tree = await (await fetch(`${base}/api/projects/my-talk/tree`)).json() as Array<{ path: string }>;
    expect(tree.some(node => node.path === "presentation.rtex")).toBe(true);
  });

  it("writes and reads files", async () => {
    const { base } = await start();
    await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "talk" }) });
    await fetch(`${base}/api/projects/talk/file`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "notes/extra.rtex", content: "hello" }) });
    const read = await (await fetch(`${base}/api/projects/talk/file?path=notes/extra.rtex`)).text();
    expect(read).toBe("hello");
  });

  it("rejects path traversal", async () => {
    const { base } = await start();
    await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "talk" }) });
    const response = await fetch(`${base}/api/projects/talk/file?path=../../etc/passwd`);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("compiles a project and returns diagnostics", async () => {
    const { base } = await start();
    await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "talk" }) });
    const result = await (await fetch(`${base}/api/projects/talk/compile`)).json() as { hasErrors: boolean; rendererName: string };
    expect(result.hasErrors).toBe(false);
    expect(result.rendererName).toBe("vue");
  });

  it("returns an error for a missing project", async () => {
    const { base } = await start();
    const response = await fetch(`${base}/api/projects/missing/compile`);
    expect(response.status).toBe(404);
  });
});
