#!/usr/bin/env node
import { watch, type FSWatcher } from "node:fs";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { analyze, formatDiagnostic, parseFileWithIncludes, type ComponentDefinition, type RevealTeXConfig } from "@revealtex/compiler";
import { rendererRegistry, type GeneratedFile } from "@revealtex/renderer-core";
import { VueRenderer } from "@revealtex/renderer-vue";
import { HtmlRenderer } from "@revealtex/renderer-html";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { introspectVueProps } from "./introspect.js";

const MANIFEST_FILE = ".revealtex-manifest.json";
let moduleImportNonce = 0;

interface WatchTarget { path: string; kind: "file" | "directory" }
interface BuildSnapshot { watchTargets: WatchTarget[] }
interface ManifestEntry { path: string; sha256: string }
interface OutputManifest { version: 1; files: ManifestEntry[] }
interface ActiveDirectoryWatcher { watcher: FSWatcher; all: boolean; names: Set<string> }

rendererRegistry.register(new VueRenderer()).register(new HtmlRenderer());
const [command = "help", sourceArg, ...rawArgs] = process.argv.slice(2);
const flags = parseFlags(rawArgs);

async function main(): Promise<void> {
  if (command === "help" || command === "--help" || !sourceArg) { usage(); return; }
  if (!["build", "watch", "dev", "create"].includes(command)) throw new Error(`Unknown command "${command}".`);

  const source = resolve(sourceArg);
  const configFile = await findConfigFile(flags.config ? resolve(String(flags.config)) : undefined, dirname(source));
  let config = await loadConfig(configFile);
  const defaultOutput = command === "dev" ? ".revealtex/dev" : command === "create" || flags.standalone ? "dist-vue" : "generated";
  const output = resolve(String(flags.output ?? config.output ?? defaultOutput));

  const build = async (): Promise<BuildSnapshot> => {
    if (configFile) config = await loadConfig(configFile);
    const { ast, sourceFiles } = await parseFileWithIncludes(source);
    const result = analyze(ast, config, sourceFiles);
    for (const diagnostic of result.diagnostics) process.stderr.write(formatDiagnostic(diagnostic) + "\n");
    if (result.diagnostics.some(diagnostic => diagnostic.severity === "error")) throw new Error("Compilation failed.");

    const rendererName = String(flags.renderer ?? config.renderer ?? "vue");
    const renderer = rendererRegistry.get(rendererName);
    if (!renderer) throw new Error(`Unknown renderer "${rendererName}". Available: ${rendererRegistry.names().join(", ")}.`);
    const rendered = await renderer.render(result.presentation, { sourceFile: source, outputDirectory: output, config });
    for (const diagnostic of rendered.diagnostics) process.stderr.write(formatDiagnostic(diagnostic) + "\n");
    if (rendered.diagnostics.some(diagnostic => diagnostic.severity === "error")) throw new Error("Rendering failed.");

    const files = [...rendered.files];
    if (rendererName === "vue" && (command === "create" || flags.standalone || command === "dev")) files.push(...standaloneFiles(config));
    await commitGeneratedOutput(output, files);
    process.stdout.write(`RevealTeX: generated ${files.length} file(s) in ${output}.\n`);
    return { watchTargets: configWatchTargets(sourceFiles, config, configFile, rendered.dependencies ?? []) };
  };

  const snapshot = await build();
  if (command === "watch" || command === "dev") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let building = false;
    let queued = false;
    const watchers = new Map<string, ActiveDirectoryWatcher>();

    const scheduleBuild = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 80);
    };
    const reconcileWatchers = (targets: WatchTarget[]) => reconcileDirectoryWatchers(watchers, targets, scheduleBuild);
    const rebuild = async () => {
      if (building) { queued = true; return; }
      building = true;
      try { reconcileWatchers((await build()).watchTargets); }
      catch (error) { report(error); }
      finally {
        building = false;
        if (queued) { queued = false; void rebuild(); }
      }
    };

    reconcileWatchers(snapshot.watchTargets);
    process.stdout.write("RevealTeX: watching source files. Press Ctrl+C to stop.\n");
    if (command === "dev") await startDevServer(output, flags);
    else {
      const close = () => {
        clearTimeout(timer);
        for (const active of watchers.values()) active.watcher.close();
        watchers.clear();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    }
  }
}

async function loadComponentMetadata(vuePath: string): Promise<Record<string, unknown> | undefined> {
  const base = vuePath.replace(/\.vue$/, "");
  for (const extension of [".meta.ts", ".meta.mjs", ".meta.js", ".meta.json"]) {
    const candidate = base + extension;
    try { await access(candidate); } catch { continue; }
    if (extension === ".meta.json") return JSON.parse(await readFile(candidate, "utf8")) as Record<string, unknown>;
    if (extension === ".meta.ts") {
      const source = await readFile(candidate, "utf8");
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      const temporary = candidate.replace(/\.ts$/, `.${process.pid}.mjs`);
      await writeFile(temporary, output);
      try { return ((await import(pathToFileURL(temporary).href)) as { default?: Record<string, unknown> }).default; }
      finally { await unlink(temporary).catch(() => undefined); }
    }
    return ((await import(pathToFileURL(candidate).href)) as { default?: Record<string, unknown> }).default;
  }
  return undefined;
}

async function collectVueFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectVueFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".vue")) files.push(path);
  }
  return files;
}

async function findConfigFile(explicit: string | undefined, cwd: string): Promise<string | undefined> {
  if (explicit) return explicit;
  for (const candidate of ["revealtex.config.ts", "revealtex.config.mjs", "revealtex.config.js"]) {
    const path = join(cwd, candidate);
    try { await access(path); return path; } catch {}
  }
  return undefined;
}

async function loadConfig(file: string | undefined): Promise<RevealTeXConfig> {
  if (!file) return {};
  let imported: { default?: RevealTeXConfig };
  let temporary: string | undefined;
  const nonce = `${Date.now()}-${moduleImportNonce++}`;
  try {
    if (extname(file) === ".ts") {
      const source = await readFile(file, "utf8");
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      temporary = join(dirname(file), `.revealtex-config-${process.pid}-${moduleImportNonce}.mjs`);
      await writeFile(temporary, output);
      imported = await import(`${pathToFileURL(temporary).href}?v=${nonce}`);
    } else {
      imported = await import(`${pathToFileURL(file).href}?v=${nonce}`);
    }
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
  }

  const config = imported!.default ?? {};
  if (config.theme?.css?.startsWith(".")) config.theme.css = resolve(dirname(file), config.theme.css);
  if (config.styles) config.styles = config.styles.map(style => style.startsWith(".") ? resolve(dirname(file), style) : style);
  if (config.components?.autoDiscover) {
    const folder = resolve(dirname(file), config.components.autoDiscover);
    const discovered = Object.fromEntries((await collectVueFiles(folder))
      .map(path => [basename(path, ".vue"), { source: path }]));
    config.components = { ...discovered, ...config.components, autoDiscover: folder } as RevealTeXConfig["components"];
  }
  const componentGroups = [config.components, ...(config.plugins ?? []).map(plugin => plugin.components)];
  for (const group of componentGroups) for (const definition of Object.values(group ?? {})) {
    if (typeof definition !== "object") continue;
    if (definition.source?.startsWith(".")) definition.source = resolve(dirname(file), definition.source);
    if (definition.vue?.startsWith(".")) definition.vue = resolve(dirname(file), definition.vue);
    if (definition.html?.renderer?.startsWith(".")) definition.html.renderer = resolve(dirname(file), definition.html.renderer);
    const vueSource = definition.vue ?? definition.source;
    if (vueSource?.endsWith(".vue")) {
      let introspected: Record<string, unknown> = {};
      try { introspected = introspectVueProps(await readFile(vueSource, "utf8")); } catch { /* ignore */ }
      let metadata: Record<string, unknown> | undefined;
      try { metadata = await loadComponentMetadata(vueSource); } catch { /* ignore */ }
      const target = definition as Record<string, unknown>;
      const combined = { ...introspected, ...(metadata?.props as Record<string, unknown> ?? {}), ...((target.props as Record<string, unknown>) ?? {}) };
      if (Object.keys(combined).length) target.props = combined;
      for (const [key, value] of Object.entries(metadata ?? {})) if (key !== "props" && target[key] === undefined) target[key] = value;
    }
  }
  for (const group of [config.layouts, ...(config.plugins ?? []).map(plugin => plugin.layouts)]) {
    for (const layout of Object.values(group ?? {})) if (layout.source.startsWith(".")) layout.source = resolve(dirname(file), layout.source);
  }
  return config;
}

function configWatchTargets(sourceFiles: string[], config: RevealTeXConfig, configFile: string | undefined, rendererDependencies: string[]): WatchTarget[] {
  const componentGroups = [config.components, ...(config.plugins ?? []).map(plugin => plugin.components)];
  const renderers = componentGroups
    .flatMap(group => Object.values(group ?? {}))
    .filter((definition): definition is ComponentDefinition => typeof definition === "object")
    .map(definition => definition.html?.renderer)
    .filter((path): path is string => Boolean(path) && isAbsolute(path!));
  const files = [...sourceFiles, ...(configFile ? [configFile] : []), ...renderers, ...rendererDependencies]
    .filter(path => isAbsolute(path));
  const directories = typeof config.components?.autoDiscover === "string" && isAbsolute(config.components.autoDiscover)
    ? [config.components.autoDiscover]
    : [];
  const targets = new Map<string, WatchTarget>();
  for (const path of files) targets.set(`file\0${path}`, { path, kind: "file" });
  for (const path of directories) targets.set(`directory\0${path}`, { path, kind: "directory" });
  return [...targets.values()];
}

function reconcileDirectoryWatchers(active: Map<string, ActiveDirectoryWatcher>, targets: WatchTarget[], onChange: () => void): void {
  const desired = new Map<string, { all: boolean; names: Set<string> }>();
  for (const target of targets) {
    const directory = target.kind === "directory" ? target.path : dirname(target.path);
    const specification = desired.get(directory) ?? { all: false, names: new Set<string>() };
    if (target.kind === "directory") specification.all = true;
    else specification.names.add(basename(target.path));
    desired.set(directory, specification);
  }

  for (const [directory, current] of active) {
    if (desired.has(directory)) continue;
    current.watcher.close();
    active.delete(directory);
  }
  for (const [directory, specification] of desired) {
    const current = active.get(directory);
    if (current) {
      current.all = specification.all;
      current.names = specification.names;
      continue;
    }
    const state: ActiveDirectoryWatcher = { watcher: undefined as unknown as FSWatcher, all: specification.all, names: specification.names };
    try {
      state.watcher = watch(directory, { recursive: state.all }, (_event, filename) => {
        const name = filename === null ? undefined : String(filename);
        if (state.all || name === undefined || state.names.has(name)) onChange();
      });
      state.watcher.on("error", error => {
        process.stderr.write(`RevealTeX: watcher failed for ${directory}: ${error.message}\n`);
        state.watcher.close();
        active.delete(directory);
      });
      active.set(directory, state);
    } catch (error) {
      process.stderr.write(`RevealTeX: could not watch ${directory}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

async function startDevServer(output: string, options: Record<string, string | boolean>): Promise<void> {
  const port = typeof options.port === "string" ? Number(options.port) : 5173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid dev server port "${String(options.port)}".`);
  const host = typeof options.host === "string" ? options.host : "127.0.0.1";
  const server = await createServer({
    root: output,
    configFile: false,
    plugins: [vue()],
    optimizeDeps: { exclude: ["@revealtex/runtime-vue"] },
    server: { host, port, strictPort: false }
  });
  await server.listen();
  process.stdout.write("RevealTeX: development server ready.\n");
  server.printUrls();
  const close = async () => { await server.close(); process.exit(0); };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

function standaloneFiles(config: RevealTeXConfig): GeneratedFile[] {
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

async function commitGeneratedOutput(output: string, generated: GeneratedFile[]): Promise<void> {
  const files = validateGeneratedFiles(output, generated);
  await mkdir(output, { recursive: true });
  const previous = await readOutputManifest(output);
  const previousEntries = new Map((previous?.files ?? []).map(entry => [entry.path, entry]));
  const nextEntries = files.map(file => ({ path: file.path, sha256: sha256(file.content) })).sort((left, right) => left.path.localeCompare(right.path));
  const nextPaths = new Set(nextEntries.map(entry => entry.path));
  const stale: string[] = [];

  for (const entry of previousEntries.values()) {
    if (nextPaths.has(entry.path)) continue;
    const current = await readSafeOutputFile(output, entry.path);
    if (current === undefined) continue;
    if (sha256(current) !== entry.sha256) {
      process.stderr.write(`RevealTeX: preserving modified stale output ${entry.path}.\n`);
      continue;
    }
    stale.push(entry.path);
  }

  await preflightOutput(output, files.map(file => file.path), stale, previousEntries, previous !== undefined);
  const stage = await mkdtemp(join(dirname(output), `.${basename(output)}.revealtex-stage-`));
  const backup = await mkdtemp(join(dirname(output), `.${basename(output)}.revealtex-backup-`));
  const changed: string[] = [];
  const backedUp: string[] = [];
  const installed: string[] = [];
  let manifestBackedUp = false;
  let manifestInstalled = false;

  try {
    for (const file of files) {
      const target = outputPath(stage, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
      const current = await readSafeOutputFile(output, file.path);
      if (current === undefined || !current.equals(asBuffer(file.content))) changed.push(file.path);
    }
    const manifestContent = JSON.stringify({ version: 1, files: nextEntries } satisfies OutputManifest, null, 2) + "\n";
    await writeFile(join(stage, MANIFEST_FILE), manifestContent);

    const manifestTarget = join(output, MANIFEST_FILE);
    const manifestBackup = join(backup, MANIFEST_FILE);
    try {
      await rename(manifestTarget, manifestBackup);
      manifestBackedUp = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }

    for (const path of [...new Set([...changed, ...stale])]) {
      const target = outputPath(output, path);
      const backupTarget = outputPath(backup, path);
      try {
        await mkdir(dirname(backupTarget), { recursive: true });
        await rename(target, backupTarget);
        backedUp.push(path);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }

    for (const path of changed.sort((left, right) => commitPriority(left) - commitPriority(right) || left.localeCompare(right))) {
      const target = outputPath(output, path);
      await mkdir(dirname(target), { recursive: true });
      await rename(outputPath(stage, path), target);
      installed.push(path);
    }
    await rename(join(stage, MANIFEST_FILE), manifestTarget);
    manifestInstalled = true;
  } catch (error) {
    if (manifestInstalled) await unlink(join(output, MANIFEST_FILE)).catch(() => undefined);
    for (const path of [...installed].reverse()) await unlink(outputPath(output, path)).catch(() => undefined);
    for (const path of [...backedUp].reverse()) {
      const target = outputPath(output, path);
      await mkdir(dirname(target), { recursive: true });
      await rename(outputPath(backup, path), target).catch(() => undefined);
    }
    if (manifestBackedUp) await rename(join(backup, MANIFEST_FILE), join(output, MANIFEST_FILE)).catch(() => undefined);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}

function validateGeneratedFiles(output: string, generated: GeneratedFile[]): GeneratedFile[] {
  const seen = new Set<string>();
  return generated.map(file => {
    const path = file.path;
    const segments = path.split("/");
    if (!path || path.includes("\0") || path.includes("\\") || isAbsolute(path) || /^[A-Za-z]:/.test(path) || segments.some(segment => !segment || segment === "." || segment === "..")) {
      throw new Error(`Renderer produced unsafe output path ${JSON.stringify(path)}.`);
    }
    if (path === MANIFEST_FILE || path.startsWith(".revealtex-stage-") || path.startsWith(".revealtex-backup-")) {
      throw new Error(`Renderer produced reserved output path ${JSON.stringify(path)}.`);
    }
    if (seen.has(path)) throw new Error(`Renderer produced duplicate output path ${JSON.stringify(path)}.`);
    seen.add(path);
    outputPath(output, path);
    return file;
  });
}

async function preflightOutput(output: string, desired: string[], stale: string[], previous: Map<string, ManifestEntry>, hasManifest: boolean): Promise<void> {
  for (const path of desired) {
    await assertSafeParents(output, path);
    const target = outputPath(output, path);
    try {
      const information = await lstat(target);
      if (information.isSymbolicLink() || !information.isFile()) throw new Error(`Output path ${target} is not a regular file.`);
      if (hasManifest && !previous.has(path)) throw new Error(`Output path ${target} is not managed by RevealTeX; refusing to overwrite it.`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  for (const path of stale) {
    await assertSafeParents(output, path);
    const target = outputPath(output, path);
    try {
      const information = await lstat(target);
      if (information.isSymbolicLink() || !information.isFile()) throw new Error(`Managed output path ${target} is not a regular file.`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

async function assertSafeParents(output: string, path: string): Promise<void> {
  const segments = path.split("/").slice(0, -1);
  let current = output;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const information = await lstat(current);
      if (information.isSymbolicLink() || !information.isDirectory()) throw new Error(`Output parent ${current} is not a safe directory.`);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
  }
}

async function readOutputManifest(output: string): Promise<OutputManifest | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(output, MANIFEST_FILE), "utf8"));
    if (!isOutputManifest(parsed)) throw new Error("manifest has an unsupported shape");
    for (const entry of parsed.files) validateManifestPath(entry.path);
    return parsed;
  } catch (error) {
    if (isMissing(error)) return undefined;
    process.stderr.write(`RevealTeX: ignoring invalid output manifest: ${error instanceof Error ? error.message : String(error)}.\n`);
    return undefined;
  }
}

function isOutputManifest(value: unknown): value is OutputManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { version?: unknown; files?: unknown };
  return candidate.version === 1 && Array.isArray(candidate.files) && candidate.files.every(entry => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as { path?: unknown; sha256?: unknown };
    return typeof item.path === "string" && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256);
  });
}

function validateManifestPath(path: string): void {
  const segments = path.split("/");
  if (!path || path.includes("\0") || path.includes("\\") || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path === MANIFEST_FILE || segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error(`manifest contains unsafe path ${JSON.stringify(path)}`);
  }
}

async function readSafeOutputFile(output: string, path: string): Promise<Buffer | undefined> {
  const target = outputPath(output, path);
  try {
    const information = await lstat(target);
    if (information.isSymbolicLink() || !information.isFile()) return undefined;
    return await readFile(target);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function outputPath(root: string, path: string): string {
  const target = resolve(root, ...path.split("/"));
  if (target === root || !target.startsWith(root + "/")) throw new Error(`Output path ${JSON.stringify(path)} escapes ${root}.`);
  return target;
}

function commitPriority(path: string): number {
  if (path === "index.html" || path === "Presentation.generated.vue") return 2;
  if (path.startsWith("assets/")) return 0;
  return 1;
}

function asBuffer(content: string | Uint8Array): Buffer {
  return typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(asBuffer(content)).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) continue;
    const [key, inline] = argument.slice(2).split("=", 2);
    if (inline !== undefined) out[key!] = inline;
    else if (args[index + 1] && !args[index + 1]!.startsWith("--")) out[key!] = args[++index]!;
    else out[key!] = true;
  }
  return out;
}

function usage(): void {
  process.stdout.write("RevealTeX\n\n  revealtex build <file.rtex> [--renderer vue|html] [--output dir]\n  revealtex watch <file.rtex> [--output dir]\n  revealtex dev <file.rtex> [--output dir] [--host 127.0.0.1] [--port 5173]\n  revealtex create <file.rtex> [--output dir]\n");
}

function report(error: unknown): void {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}

main().catch(report);
