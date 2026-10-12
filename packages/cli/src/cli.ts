#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDiagnostic } from "@revealtex/compiler";
import {
  commitGeneratedOutput,
  compilePresentation,
  findConfigFile,
  loadConfig,
  reconcileDirectoryWatchers,
  standaloneFiles,
  type ActiveDirectoryWatcher,
  type RevealTeXConfig,
  type WatchTarget
} from "@revealtex/core";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { createStudioServer } from "@revealtex/studio";

interface BuildSnapshot { watchTargets: WatchTarget[] }

const [command = "help", sourceArg, ...rawArgs] = process.argv.slice(2);
const flags = parseFlags(rawArgs);

async function main(): Promise<void> {
  if (command === "--version" || command === "-v" || command === "version") {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    process.stdout.write(`revealtex ${pkg.version ?? "0.0.0"}\n`);
    return;
  }
  if (command === "init") {
    const target = resolve(sourceArg ?? ".");
    await initProject(target);
    process.stdout.write(`RevealTeX: created a starter project in ${target}.\n`);
    return;
  }
  if (command === "studio") {
    await startStudio(flags);
    return;
  }
  if (command === "help" || command === "--help" || !sourceArg) { usage(); return; }
  if (!["build", "watch", "dev", "create"].includes(command)) throw new Error(`Unknown command "${command}".`);

  const source = resolve(sourceArg);
  const configFile = await findConfigFile(flags.config ? resolve(String(flags.config)) : undefined, dirname(source));
  let config: RevealTeXConfig = await loadConfig(configFile);
  const defaultOutput = command === "dev" ? ".revealtex/dev" : command === "create" || flags.standalone ? "dist-vue" : "generated";
  const output = resolve(String(flags.output ?? config.output ?? defaultOutput));

  const build = async (): Promise<BuildSnapshot> => {
    if (configFile) config = await loadConfig(configFile);
    const result = await compilePresentation({
      sourceFile: source,
      outputDirectory: output,
      renderer: flags.renderer !== undefined ? String(flags.renderer) : undefined,
      config,
      configFile
    });
    for (const diagnostic of result.diagnostics) process.stderr.write(formatDiagnostic(diagnostic) + "\n");
    if (result.hasErrors) throw new Error("Compilation failed.");

    const files = [...result.files];
    if (result.rendererName === "vue" && (command === "create" || flags.standalone || command === "dev")) files.push(...standaloneFiles(result.config));
    await commitGeneratedOutput(output, files, message => process.stderr.write(`RevealTeX: ${message}.\n`));
    process.stdout.write(`RevealTeX: generated ${files.length} file(s) in ${output}.\n`);
    return { watchTargets: result.watchTargets };
  };

  const snapshot = await build();
  if (command === "watch" || command === "dev") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let building = false;
    let queued = false;
    const watchers = new Map<string, ActiveDirectoryWatcher>();
    const warn = (message: string) => process.stderr.write(`RevealTeX: ${message}\n`);

    const scheduleBuild = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 80);
    };
    const reconcileWatchers = (targets: WatchTarget[]) => reconcileDirectoryWatchers(watchers, targets, scheduleBuild, warn);
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

async function initProject(target: string): Promise<void> {
  const files: Record<string, string> = {
    "presentation.rtex": `\\documentclass{reveal}
\\title{My Presentation}
\\author{You}
\\date{\\today}
\\begin{document}
\\maketitle
\\begin{frame}{Hello}
Welcome to RevealTeX.
\\begin{itemize}
\\item<1-> Author in LaTeX
\\item<2-> Present in reveal.js
\\end{itemize}
\\Metric[value=94.7,label={Accuracy}]
\\end{frame}
\\end{document}
`,
    "revealtex.config.ts": `import { defineConfig } from "revealtex";
export default defineConfig({
  components: { autoDiscover: "./src/components" }
});
`,
    "src/components/Metric.vue": `<script setup lang="ts">
defineProps<{ value: number; label: string }>();
</script>
<template><div class="metric"><strong>{{ value }}</strong><span>{{ label }}</span></div></template>
<style scoped>.metric{display:grid;gap:.2em;text-align:center}.metric strong{font-size:2em;color:#8b5cf6}.metric span{color:#94a3b8}</style>
`
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = join(target, relative);
    try { await access(file); continue; } catch { /* create when missing */ }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

async function startStudio(flags: Record<string, string | boolean>): Promise<void> {
  const projectsRoot = resolve(String(flags.projects ?? ".studio-projects"));
  const port = flags.port !== undefined ? Number(flags.port) : 4400;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid studio port "${String(flags.port)}".`);
  const host = flags.host !== undefined ? String(flags.host) : "127.0.0.1";
  const studioWebDir = flags.web !== undefined ? resolve(String(flags.web)) : fileURLToPath(new URL("../../../apps/studio-web/dist/", import.meta.url));
  const templatesDirectory = flags.templates !== undefined ? resolve(String(flags.templates)) : undefined;
  const server = createStudioServer({ projectsRoot, host, port, studioWebDir, templatesDirectory });
  const { url } = await server.listen();
  process.stdout.write(`RevealTeX Studio running at ${url}\nProjects directory: ${projectsRoot}\nPress Ctrl+C to stop.\n`);
  const close = async () => { await server.close(); process.exit(0); };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
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
  process.stdout.write([
    "RevealTeX - LaTeX-inspired presentations for reveal.js",
    "",
    "Usage:",
    "  revealtex <command> <file.rtex> [options]",
    "",
    "Commands:",
    "  init      Create a starter project in a directory",
    "  studio    Start the browser-based studio (Overleaf-style editor)",
    "  dev       Compile, watch, and serve with Vite",
    "  watch     Compile and rebuild on changes",
    "  build     Compile once",
    "  create    Compile and scaffold a standalone Vite project",
    "  help      Show this message",
    "",
    "Options:",
    "  --config <file>        revealtex.config.ts|.mjs|.js",
    "  --output <dir>         Output directory",
    "  --renderer vue|html    Output renderer (default: vue)",
    "  --standalone           Emit standalone Vite project files",
    "  --host <host>          Dev server host (dev)",
    "  --port <port>          Dev server port (dev)",
    "  --projects <dir>       Projects directory (studio, default .studio-projects)",
    "  --templates <dir>      Extra templates directory (studio)",
    "  --web <dir>            Studio web build directory (studio)",
    "  --version              Print the version",
    ""
  ].join("\n"));
}

function report(error: unknown): void {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}

main().catch(report);
