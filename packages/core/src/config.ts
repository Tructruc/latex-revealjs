import { access, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { RevealTeXConfig } from "@revealtex/compiler";
import { introspectVueProps } from "./introspect.js";

export const CONFIG_FILE_NAMES = ["revealtex.config.ts", "revealtex.config.mjs", "revealtex.config.js"];
let moduleImportNonce = 0;

export async function findConfigFile(explicit: string | undefined, cwd: string): Promise<string | undefined> {
  if (explicit) return explicit;
  for (const candidate of CONFIG_FILE_NAMES) {
    const path = join(cwd, candidate);
    try { await access(path); return path; } catch { /* keep looking */ }
  }
  return undefined;
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

export async function collectVueFiles(directory: string): Promise<string[]> {
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

/** Load and normalize a `revealtex.config.ts|.mjs|.js` file. */
export async function loadConfig(file: string | undefined): Promise<RevealTeXConfig> {
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

  const config = imported.default ?? {};
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
    for (const layout of Object.values(group ?? {})) {
      if (layout.source.startsWith(".")) layout.source = resolve(dirname(file), layout.source);
      if (layout.html?.renderer?.startsWith(".")) layout.html.renderer = resolve(dirname(file), layout.html.renderer);
    }
  }
  return config;
}
