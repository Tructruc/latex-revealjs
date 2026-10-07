import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { closeSync, openSync, readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cliEntry = join(repositoryRoot, "packages/cli/dist/cli.js");
const temporaryDirectories = new Set<string>();
const runningProcesses = new Set<RunningCli>();

afterEach(async () => {
  await Promise.all([...runningProcesses].map(process => process.stop()));
  await Promise.all([...temporaryDirectories].map(path => rm(path, { recursive: true, force: true })));
  runningProcesses.clear();
  temporaryDirectories.clear();
});

describe.sequential("RevealTeX CLI integration", () => {
  it("reloads configuration while watch mode is running", async () => {
    const fixture = await createFixture("config-reload");
    await writeFile(fixture.source, deck("Configuration", "The first build."));
    await writeFile(fixture.config, htmlConfig(false));

    const cli = await startWatch(fixture);
    expect(await readFile(fixture.html, "utf8")).toContain('"controls":false');

    const outputOffset = cli.stdout.length;
    await writeFile(fixture.config, htmlConfig(true));
    await cli.waitForStdout("RevealTeX: generated", outputOffset);

    const reloaded = await readFile(fixture.html, "utf8");
    expect(reloaded).toContain('"controls":true');
    expect(reloaded).not.toContain('"controls":false');
  });

  it("discovers Vue components and responds to auto-discovery directory changes", async () => {
    const fixture = await createFixture("auto-discovery");
    const components = join(fixture.root, "components");
    const alpha = join(components, "Alpha.vue");
    const beta = join(components, "Beta.vue");
    await mkdir(components, { recursive: true });
    await writeFile(alpha, vueComponent("alpha"));
    await writeFile(fixture.config, `export default { renderer: "vue", components: { autoDiscover: "./components" } };\n`);
    await writeFile(fixture.source, deck("Components", String.raw`\Alpha[]`));

    const cli = await startWatch(fixture);
    const initial = await readFile(join(fixture.output, "Presentation.generated.vue"), "utf8");
    expect(initial).toContain(`import Alpha from ${JSON.stringify(alpha)}`);

    // Only the watched directory changes here. A generated message proves the
    // directory event caused config discovery to run again.
    const discoveryOffset = cli.stdout.length;
    await writeFile(beta, vueComponent("beta"));
    await cli.waitForStdout("RevealTeX: generated", discoveryOffset);

    const sourceOffset = cli.stdout.length;
    await writeFile(fixture.source, deck("Components", String.raw`\Beta[]`));
    await cli.waitForStdout("RevealTeX: generated", sourceOffset);
    await waitUntil(async () => (await readFile(join(fixture.output, "Presentation.generated.vue"), "utf8")).includes("import Beta from"), "the discovered Beta component to be rendered");

    const refreshed = await readFile(join(fixture.output, "Presentation.generated.vue"), "utf8");
    expect(refreshed).toContain(`import Beta from ${JSON.stringify(beta)}`);
    expect(refreshed).not.toContain(`import Alpha from ${JSON.stringify(alpha)}`);
  });

  it("loads an HTML renderer with a local dependency and reloads renderer entry changes", async () => {
    const fixture = await createFixture("renderer-reload");
    const renderers = join(fixture.root, "renderers");
    const renderer = join(renderers, "card.mjs");
    await mkdir(renderers, { recursive: true });
    await writeFile(join(renderers, "markup.mjs"), `export const card = (version, label) => \`<article data-renderer="${"${version}"}">${"${label}"}</article>\`;\n`);
    await writeFile(renderer, cardRenderer("one"));
    await writeFile(fixture.config, `export default {
  renderer: "html",
  components: {
    Card: {
      html: { renderer: "./renderers/card.mjs" },
      props: { label: { type: "string", required: true } }
    }
  }
};\n`);
    await writeFile(fixture.source, deck("Renderer", String.raw`\Card[label={Local dependency}]`));

    const cli = await startWatch(fixture);
    const initial = await readFile(fixture.html, "utf8");
    expect(initial).toContain('<article data-renderer="one">Local dependency</article>');

    const outputOffset = cli.stdout.length;
    await writeFile(renderer, cardRenderer("two"));
    await cli.waitForStdout("RevealTeX: generated", outputOffset);

    const reloaded = await readFile(fixture.html, "utf8");
    expect(reloaded).toContain('<article data-renderer="two">Local dependency</article>');
    expect(reloaded).not.toContain('data-renderer="one"');
  });

  it("preflights output conflicts before replacing the previous HTML build", async () => {
    const fixture = await createFixture("atomic-output");
    const sourceAssets = join(fixture.root, "source-assets");
    const sourceAsset = join(sourceAssets, "photo.png");
    const assetsDestination = join(fixture.output, "assets");
    await mkdir(sourceAssets, { recursive: true });
    await writeFile(sourceAsset, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x42]));
    await writeFile(fixture.config, `export default { renderer: "html" };\n`);
    await writeFile(fixture.source, deck("Stable output", "This is the last known-good deck."));

    const cli = await startWatch(fixture);
    const stableHtml = await readFile(fixture.html);

    // A regular file blocks the directory needed by the next render. The CLI
    // must detect that conflict before committing the newly rendered index.
    await writeFile(assetsDestination, "occupied by a non-directory fixture\n");
    const errorOffset = cli.stderr.length;
    await writeFile(fixture.source, imageDeck("Must not leak", "source-assets/photo.png"));
    await cli.waitForStderr("assets", errorOffset);

    expect(await readFile(fixture.html)).toEqual(stableHtml);
    expect(await readFile(assetsDestination, "utf8")).toBe("occupied by a non-directory fixture\n");
  });

  it("recopies changed binary assets, removes stale outputs, and preserves a good build after failure", async () => {
    const fixture = await createFixture("asset-lifecycle");
    const sourceAssets = join(fixture.root, "source-assets");
    const firstSource = join(sourceAssets, "photo.png");
    const secondSource = join(sourceAssets, "replacement.png");
    const firstBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    const changedBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x09, 0x08, 0x07]);
    const secondBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xaa, 0xbb, 0xcc]);
    await mkdir(sourceAssets, { recursive: true });
    await writeFile(firstSource, firstBytes);
    await writeFile(secondSource, secondBytes);
    await writeFile(fixture.config, `export default { renderer: "html" };\n`);
    await writeFile(fixture.source, imageDeck("Reliable assets", "source-assets/photo.png"));

    const cli = await startWatch(fixture);
    let html = await readFile(fixture.html, "utf8");
    let packagedUrl = packagedImageUrl(html);
    let packagedPath = resolve(fixture.output, packagedUrl);
    expect(new Uint8Array(await readFile(packagedPath))).toEqual(firstBytes);

    // The presentation source does not change: the copied asset itself must be
    // a watch target and must cause a rebuild.
    const assetOffset = cli.stdout.length;
    await writeFile(firstSource, changedBytes);
    await cli.waitForStdout("RevealTeX: generated", assetOffset);
    html = await readFile(fixture.html, "utf8");
    const changedUrl = packagedImageUrl(html);
    const changedPath = resolve(fixture.output, changedUrl);
    expect(new Uint8Array(await readFile(changedPath))).toEqual(changedBytes);
    if (changedPath !== packagedPath) await expectMissing(packagedPath);
    packagedPath = changedPath;

    // Replacing the reference must remove the no-longer-generated asset.
    const replacementOffset = cli.stdout.length;
    await writeFile(fixture.source, imageDeck("Reliable assets", "source-assets/replacement.png"));
    await cli.waitForStdout("RevealTeX: generated", replacementOffset);
    html = await readFile(fixture.html, "utf8");
    const replacementPath = resolve(fixture.output, packagedImageUrl(html));
    expect(new Uint8Array(await readFile(replacementPath))).toEqual(secondBytes);
    if (replacementPath !== packagedPath) await expectMissing(packagedPath);

    // A bad source update cannot replace any part of the last successful deck.
    const stableHtml = await readFile(fixture.html);
    const stableAsset = await readFile(replacementPath);
    const errorOffset = cli.stderr.length;
    await writeFile(fixture.source, deck("Broken replacement", String.raw`\DefinitelyMissing[]`));
    await cli.waitForStderr("Compilation failed.", errorOffset);
    expect(await readFile(fixture.html)).toEqual(stableHtml);
    expect(await readFile(replacementPath)).toEqual(stableAsset);

    // Watch mode recovers after the failure, and dropping the final reference
    // cleans up its packaged file as part of the successful replacement.
    const recoveryOffset = cli.stdout.length;
    await writeFile(fixture.source, deck("Recovered", "No packaged asset remains."));
    await cli.waitForStdout("RevealTeX: generated", recoveryOffset);
    const recovered = await readFile(fixture.html, "utf8");
    expect(recovered).toContain("Recovered");
    expect(recovered).not.toContain("<img");
    await expectMissing(replacementPath);
  }, 20_000);

  it("loads sidecar component metadata", async () => {
    const fixture = await createFixture("metadata");
    const components = join(fixture.root, "components");
    await mkdir(components, { recursive: true });
    await writeFile(join(components, "Panel.vue"), `<template><div class="panel">Panel</div></template>\n`);
    await writeFile(join(components, "Panel.meta.json"), JSON.stringify({ portability: "portable", semanticFallback: { tag: "article", class: "panel-fallback" } }));
    await writeFile(fixture.config, `export default { renderer: "html", components: { autoDiscover: "./components" } };\n`);
    await writeFile(fixture.source, deck("Panel", String.raw`\Panel[]`));

    await runCli(["build", fixture.source, "--config", fixture.config, "--output", fixture.output]);
    const html = await readFile(join(fixture.output, "index.html"), "utf8");
    expect(html).toContain('class="rt-component rt-Panel panel-fallback"');
  }, 20_000);

  it("discovers components in nested directories", async () => {
    const fixture = await createFixture("nested-discovery");
    const nested = join(fixture.root, "components", "widgets");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "Widget.vue"), vueComponent("widget"));
    await writeFile(fixture.config, `export default { renderer: "vue", components: { autoDiscover: "./components" } };\n`);
    await writeFile(fixture.source, deck("Nested", String.raw`\Widget[]`));

    await runCli(["build", fixture.source, "--config", fixture.config, "--output", fixture.output]);
    const vue = await readFile(join(fixture.output, "Presentation.generated.vue"), "utf8");
    expect(vue).toContain("import Widget from");
  }, 20_000);

  it("validates props introspected from auto-discovered components", async () => {
    const fixture = await createFixture("introspect");
    const components = join(fixture.root, "components");
    await mkdir(components, { recursive: true });
    await writeFile(join(components, "Gauge.vue"), `<script setup lang="ts">defineProps<{ value: number }>()</script><template><div>{{ value }}</div></template>\n`);
    await writeFile(fixture.config, `export default { renderer: "vue", components: { autoDiscover: "./components" } };\n`);
    await writeFile(fixture.source, deck("Gauge", String.raw`\Gauge[value={oops}]`));

    await expect(runCli(["build", fixture.source, "--config", fixture.config, "--output", fixture.output])).rejects.toThrow(/RTX3003/);
  }, 20_000);

  it("scaffolds a starter project with init", async () => {
    const root = await mkdtemp(join(tmpdir(), "revealtex-init-"));
    temporaryDirectories.add(root);

    await runCli(["init", root]);
    for (const file of ["presentation.rtex", "revealtex.config.ts", "src/components/Metric.vue"]) {
      await expect(access(join(root, file))).resolves.toBeUndefined();
    }
    const source = await readFile(join(root, "presentation.rtex"), "utf8");
    expect(source).toContain("\\Metric[value=94.7");
  }, 20_000);

  it("prints its version", async () => {
    const result = await runCli(["--version"]);
    expect(result.stdout).toMatch(/revealtex \d+\.\d+\.\d+/);
  });

  it("scaffolds a standalone project with create", async () => {
    const fixture = await createFixture("create");
    await writeFile(fixture.source, deck("Standalone", "Hello from create."));

    const result = await runCli(["create", fixture.source, "--output", fixture.output]);
    expect(result.stdout).toContain("generated");

    for (const file of ["index.html", "package.json", "src/main.ts", "src/style.css", "vite.config.ts"]) {
      await expect(access(join(fixture.output, file))).resolves.toBeUndefined();
    }
    const vue = await readFile(join(fixture.output, "Presentation.generated.vue"), "utf8");
    expect(vue).toContain("RevealDeck");
  }, 20_000);
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliEntry, ...args], { env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout?.on("data", chunk => { stdout += String(chunk); });
    child.stderr?.on("data", chunk => { stderr += String(chunk); });
    child.on("error", rejectRun);
    child.on("exit", code => code === 0 ? resolveRun({ stdout, stderr }) : rejectRun(new Error(`CLI exited with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`)));
  });
}

interface Fixture {
  root: string;
  source: string;
  config: string;
  output: string;
  html: string;
}

interface RunningCli {
  child: ChildProcess;
  spawnError?: Error;
  stdout: string;
  stderr: string;
  waitForStdout(value: string, from?: number): Promise<void>;
  waitForStderr(value: string, from?: number): Promise<void>;
  stop(): Promise<void>;
}

async function createFixture(name: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `revealtex-${name}-`));
  temporaryDirectories.add(root);
  const output = join(root, "output");
  return {
    root,
    source: join(root, "presentation.rtex"),
    config: join(root, "revealtex.config.mjs"),
    output,
    html: join(output, "index.html")
  };
}

async function startWatch(fixture: Fixture): Promise<RunningCli> {
  const stdoutLog = join(fixture.root, ".revealtex-cli.stdout.log");
  const stderrLog = join(fixture.root, ".revealtex-cli.stderr.log");
  await Promise.all([writeFile(stdoutLog, ""), writeFile(stderrLog, "")]);
  const stdoutDescriptor = openSync(stdoutLog, "a");
  const stderrDescriptor = openSync(stderrLog, "a");
  let child: ChildProcess;
  try {
    // File descriptors are intentional here. Some managed runners give nested
    // Node processes handle-less pipe streams, causing process.stdout.write()
    // to be silently discarded. Regular-file descriptors behave consistently
    // in those runners and in ordinary local/CI environments.
    child = spawn(process.execPath, [cliEntry, "watch", fixture.source, "--output", fixture.output], {
      cwd: fixture.root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", stdoutDescriptor, stderrDescriptor]
    });
  } finally {
    closeSync(stdoutDescriptor);
    closeSync(stderrDescriptor);
  }

  let spawnError: Error | undefined;
  child.on("error", error => { spawnError = error; });

  const running: RunningCli = {
    child,
    get spawnError() { return spawnError; },
    get stdout() { return readLog(stdoutLog); },
    get stderr() { return readLog(stderrLog); },
    waitForStdout: (value, from = 0) => waitForOutput(running, "stdout", value, from),
    waitForStderr: (value, from = 0) => waitForOutput(running, "stderr", value, from),
    stop: async () => {
      runningProcesses.delete(running);
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      const stopped = await Promise.race([exit.then(() => true), delay(2_000).then(() => false)]);
      if (!stopped && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exit;
      }
    }
  };
  runningProcesses.add(running);

  try {
    await running.waitForStdout("RevealTeX: watching source files.");
  } catch (error) {
    await running.stop();
    throw new Error(`CLI did not enter watch mode.\nstdout:\n${running.stdout}\nstderr:\n${running.stderr}`, { cause: error });
  }
  return running;
}

async function waitForOutput(process: RunningCli, stream: "stdout" | "stderr", value: string, from: number): Promise<void> {
  try {
    await waitUntil(() => {
      if (process[stream].slice(from).includes(value)) return true;
      if (process.spawnError) throw process.spawnError;
      if (process.child.exitCode !== null || process.child.signalCode !== null) {
        throw new Error(`CLI exited before emitting ${JSON.stringify(value)}.`);
      }
      return false;
    }, `${stream} to contain ${JSON.stringify(value)}`);
  } catch (error) {
    throw new Error(`CLI output wait failed.\nstdout:\n${process.stdout}\nstderr:\n${process.stderr}`, { cause: error });
  }
}

function readLog(path: string): string {
  try { return readFileSync(path, "utf8"); }
  catch { return ""; }
}

async function waitUntil(check: () => boolean | Promise<boolean>, description: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
      break;
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${description}.`, lastError === undefined ? undefined : { cause: lastError });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

function deck(title: string, content: string): string {
  return `\\begin{document}\n\\begin{frame}{${title}}\n${content}\n\\end{frame}\n\\end{document}\n`;
}

function imageDeck(title: string, asset: string): string {
  return deck(title, `\\image[alt={Packaged fixture}]{${asset}}`);
}

function htmlConfig(controls: boolean): string {
  return `export default { renderer: "html", reveal: { controls: ${String(controls)} } };\n`;
}

function vueComponent(label: string): string {
  return `<template><div data-fixture="${label}">${label}</div></template>\n`;
}

function cardRenderer(version: string): string {
  return `import { card } from "./markup.mjs";\nexport default ({ props, escape }) => card(${JSON.stringify(version)}, escape(props.label));\n`;
}

function packagedImageUrl(html: string): string {
  const match = html.match(/<img src="([^"]+)"[^>]*alt="Packaged fixture"/);
  if (!match?.[1]) throw new Error("Generated HTML did not contain the packaged fixture image.");
  if (!match[1].startsWith("assets/")) throw new Error(`Image was not packaged: ${match[1]}`);
  return match[1];
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}
