import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { BUILTIN_TEMPLATES, findTemplate, type ProjectTemplate } from "./templates.js";

export interface ProjectSummary { id: string; name: string; mainFile: string }
export interface FileNode { name: string; path: string; type: "file" | "directory"; children?: FileNode[] }

const IGNORED = new Set(["node_modules", ".git", ".studio", "generated", "dist", ".revealtex"]);
const MAX_DEPTH = 12;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface ProjectStoreOptions {
  /** Directory containing all projects. */
  root: string;
  /** Optional extra templates directory; each subdirectory is a template. */
  templatesDirectory?: string;
  /** Main `.rtex` file name inside a project. */
  mainFile?: string;
}

export class ProjectStore {
  readonly root: string;
  readonly mainFile: string;
  private readonly templatesDirectory?: string;

  constructor(options: ProjectStoreOptions) {
    this.root = resolve(options.root);
    this.mainFile = options.mainFile ?? "presentation.rtex";
    this.templatesDirectory = options.templatesDirectory ? resolve(options.templatesDirectory) : undefined;
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  /** Resolve a project id to its directory, rejecting unsafe ids. */
  projectDir(id: string): string {
    if (!ID_PATTERN.test(id) || id.includes("..")) throw new StudioError(400, `Invalid project id ${JSON.stringify(id)}.`);
    const dir = resolve(this.root, id);
    if (dir === this.root || !dir.startsWith(this.root + sep)) throw new StudioError(400, `Invalid project id ${JSON.stringify(id)}.`);
    return dir;
  }

  /** Resolve a project-relative path, rejecting traversal outside the project. */
  filePath(id: string, path: string): string {
    const dir = this.projectDir(id);
    const clean = String(path ?? "").replace(/\\/g, "/");
    if (!clean || clean.includes("\0") || clean.startsWith("/") || /^[A-Za-z]:/.test(clean)) throw new StudioError(400, `Invalid path ${JSON.stringify(path)}.`);
    const target = resolve(dir, clean);
    if (target === dir || !target.startsWith(dir + sep)) throw new StudioError(400, `Path ${JSON.stringify(path)} escapes the project.`);
    return target;
  }

  async list(): Promise<ProjectSummary[]> {
    let entries;
    try { entries = await readdir(this.root, { withFileTypes: true }); } catch { return []; }
    const projects: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED.has(entry.name) || !ID_PATTERN.test(entry.name)) continue;
      const main = join(this.root, entry.name, this.mainFile);
      try { await stat(main); projects.push({ id: entry.name, name: entry.name, mainFile: this.mainFile }); } catch { /* not a project */ }
    }
    return projects.sort((left, right) => left.name.localeCompare(right.name));
  }

  async exists(id: string): Promise<boolean> {
    try { await stat(this.projectDir(id)); return true; } catch { return false; }
  }

  async create(name: string, templateName = "blank"): Promise<ProjectSummary> {
    const id = slugify(name);
    if (!id) throw new StudioError(400, "Project name must contain at least one letter or digit.");
    if (await this.exists(id)) throw new StudioError(409, `Project "${id}" already exists.`);
    const dir = this.projectDir(id);
    await mkdir(dir, { recursive: true });
    const template = (await this.templates()).find(candidate => candidate.name === templateName) ?? findTemplate(BUILTIN_TEMPLATES, templateName) ?? BUILTIN_TEMPLATES[0]!;
    for (const [path, content] of Object.entries(template.files)) await this.write(id, path, content);
    if (!template.files[this.mainFile]) await this.write(id, this.mainFile, `\\documentclass{reveal}\n\\begin{document}\n\\begin{frame}{Hello}\nWrite your content here.\n\\end{frame}\n\\end{document}\n`);
    return { id, name: id, mainFile: this.mainFile };
  }

  async remove(id: string): Promise<void> {
    await rm(this.projectDir(id), { recursive: true, force: true });
  }

  async templates(): Promise<ProjectTemplate[]> {
    const templates = [...BUILTIN_TEMPLATES];
    if (!this.templatesDirectory) return templates;
    let entries;
    try { entries = await readdir(this.templatesDirectory, { withFileTypes: true }); } catch { return templates; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(this.templatesDirectory, entry.name);
      const files = await readDirectoryFiles(dir);
      if (Object.keys(files).length) templates.push({ name: entry.name, label: entry.name, files });
    }
    return templates;
  }

  async tree(id: string): Promise<FileNode[]> {
    const dir = this.projectDir(id);
    try { await stat(dir); } catch { throw new StudioError(404, `Project "${id}" not found.`); }
    return this.readTree(dir, "", 0);
  }

  private async readTree(absolute: string, relativePath: string, depth: number): Promise<FileNode[]> {
    if (depth > MAX_DEPTH) return [];
    const entries = await readdir(absolute, { withFileTypes: true });
    const nodes: FileNode[] = [];
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
      const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) nodes.push({ name: entry.name, path: childRelative, type: "directory", children: await this.readTree(join(absolute, entry.name), childRelative, depth + 1) });
      else if (entry.isFile()) nodes.push({ name: entry.name, path: childRelative, type: "file" });
    }
    return nodes.sort((left, right) => (left.type === right.type ? left.name.localeCompare(right.name) : left.type === "directory" ? -1 : 1));
  }

  async read(id: string, path: string): Promise<string> {
    try { return await readFile(this.filePath(id, path), "utf8"); }
    catch (error) { throw toStudioError(error, `Could not read ${path}.`); }
  }

  async write(id: string, path: string, content: string): Promise<void> {
    const target = this.filePath(id, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  async writeBinary(id: string, path: string, base64: string): Promise<void> {
    const target = this.filePath(id, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(base64, "base64"));
  }

  async removeFile(id: string, path: string): Promise<void> {
    await rm(this.filePath(id, path), { recursive: true, force: true });
  }

  async move(id: string, from: string, to: string): Promise<void> {
    const source = this.filePath(id, from);
    const target = this.filePath(id, to);
    await mkdir(dirname(target), { recursive: true });
    await rename(source, target);
  }

  /** Copy a project's files into the configured user templates directory. */
  async saveTemplate(id: string, name: string): Promise<string> {
    if (!this.templatesDirectory) throw new StudioError(400, "No templates directory is configured (use --templates).");
    const templateName = slugify(name);
    if (!templateName) throw new StudioError(400, "Template name must contain at least one letter or digit.");
    const target = join(this.templatesDirectory, templateName);
    const files = await readDirectoryFiles(this.projectDir(id));
    for (const [path, content] of Object.entries(files)) {
      const file = join(target, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    return templateName;
  }

  async mainFilePath(id: string): Promise<string> {
    const dir = this.projectDir(id);
    try { await stat(dir); } catch { throw new StudioError(404, `Project "${id}" not found.`); }
    const candidate = join(dir, this.mainFile);
    try { await stat(candidate); return candidate; }
    catch { throw new StudioError(400, `Project "${id}" has no ${this.mainFile}.`); }
  }

  relative(id: string, absolute: string): string {
    return relative(this.projectDir(id), absolute).split(sep).join("/");
  }
}

export class StudioError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "StudioError"; }
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 64);
}

async function readDirectoryFiles(dir: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await readDirectoryFiles(join(dir, entry.name), relativePath));
    else if (entry.isFile()) files[relativePath] = await readFile(join(dir, entry.name), "utf8").catch(() => "");
  }
  return files;
}

function toStudioError(error: unknown, message: string): StudioError {
  if (error instanceof StudioError) return error;
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "ENOENT") return new StudioError(404, message);
  return new StudioError(500, message);
}
