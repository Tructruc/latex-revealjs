export interface ProjectSummary { id: string; name: string; mainFile: string }
export interface FileNode { name: string; path: string; type: "file" | "directory"; children?: FileNode[] }
export interface TemplateSummary { name: string; label: string; description?: string }
export interface Diagnostic { severity: "error" | "warning" | "info"; code: string; message: string; hint?: string; location?: { file: string; start: { line: number; column: number } } }
export interface BuildResponse { id: string; rendererName: string; hasErrors: boolean; diagnostics: Diagnostic[]; sourceFiles: string[]; preview?: { kind: string; url: string } }

async function request(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  }
  return response;
}

const json = (body: unknown): RequestInit => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  async listProjects(): Promise<ProjectSummary[]> { return (await request("/api/projects")).json(); },
  async templates(): Promise<TemplateSummary[]> { return (await request("/api/templates")).json(); },
  async createProject(name: string, template: string): Promise<ProjectSummary> { return (await request("/api/projects", { method: "POST", ...json({ name, template }) })).json(); },
  async deleteProject(id: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); },
  async saveTemplate(id: string, name: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/template`, { method: "POST", ...json({ name }) }); },
  async tree(id: string): Promise<FileNode[]> { return (await request(`/api/projects/${encodeURIComponent(id)}/tree`)).json(); },
  async readFile(id: string, path: string): Promise<string> { return (await request(`/api/projects/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`)).text(); },
  async writeFile(id: string, path: string, content: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/file`, { method: "PUT", ...json({ path, content }) }); },
  async createFile(id: string, path: string, content = ""): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/file`, { method: "POST", ...json({ path, content }) }); },
  async uploadBinary(id: string, path: string, dataUrl: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/binary`, { method: "POST", ...json({ path, data: dataUrl }) }); },
  async renameFile(id: string, from: string, to: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/file`, { method: "PATCH", ...json({ from, to }) }); },
  async deleteFile(id: string, path: string): Promise<void> { await request(`/api/projects/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }); },
  async preview(id: string, renderer?: string): Promise<BuildResponse> { return (await request(`/api/projects/${encodeURIComponent(id)}/preview`, { method: "POST", ...json({ renderer }) })).json(); }
};
