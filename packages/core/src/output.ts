import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { GeneratedFile } from "@revealtex/renderer-core";

export const MANIFEST_FILE = ".revealtex-manifest.json";

interface ManifestEntry { path: string; sha256: string }
interface OutputManifest { version: 1; files: ManifestEntry[] }

/**
 * Write a set of generated files atomically: stage everything, back up the
 * files that will change, then swap them in so a failed build never leaves a
 * half-written output directory. Previously generated files that are no longer
 * produced but were modified by hand are preserved.
 */
export async function commitGeneratedOutput(output: string, generated: GeneratedFile[], onWarning?: (message: string) => void): Promise<void> {
  const files = validateGeneratedFiles(output, generated);
  await mkdir(output, { recursive: true });
  const previous = await readOutputManifest(output, onWarning);
  const previousEntries = new Map((previous?.files ?? []).map(entry => [entry.path, entry]));
  const nextEntries = files.map(file => ({ path: file.path, sha256: sha256(file.content) })).sort((left, right) => left.path.localeCompare(right.path));
  const nextPaths = new Set(nextEntries.map(entry => entry.path));
  const stale: string[] = [];

  for (const entry of previousEntries.values()) {
    if (nextPaths.has(entry.path)) continue;
    const current = await readSafeOutputFile(output, entry.path);
    if (current === undefined) continue;
    if (sha256(current) !== entry.sha256) {
      onWarning?.(`preserving modified stale output ${entry.path}`);
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

async function readOutputManifest(output: string, onWarning?: (message: string) => void): Promise<OutputManifest | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(output, MANIFEST_FILE), "utf8"));
    if (!isOutputManifest(parsed)) throw new Error("manifest has an unsupported shape");
    for (const entry of parsed.files) validateManifestPath(entry.path);
    return parsed;
  } catch (error) {
    if (isMissing(error)) return undefined;
    onWarning?.(`ignoring invalid output manifest: ${error instanceof Error ? error.message : String(error)}`);
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

/** Resolve a renderer-provided relative path inside an output directory, rejecting escapes. */
export function outputPath(root: string, path: string): string {
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
