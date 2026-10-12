import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compilePresentation, compileToOutput } from "../src/index.js";

const roots = new Set<string>();
async function project(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "revealtex-core-"));
  roots.add(root);
  await writeFile(join(root, "presentation.rtex"), source);
  return root;
}
afterEach(async () => { await Promise.all([...roots].map(root => rm(root, { recursive: true, force: true }))); roots.clear(); });

describe("compilePresentation", () => {
  it("renders a valid deck without writing to disk", async () => {
    const root = await project(String.raw`\title{Demo}\begin{document}\maketitle\begin{frame}{Hello}World\end{frame}\end{document}`);
    const result = await compilePresentation({ sourceFile: join(root, "presentation.rtex"), outputDirectory: join(root, "out") });
    expect(result.hasErrors).toBe(false);
    expect(result.rendererName).toBe("vue");
    expect(result.diagnostics).toEqual([]);
    expect(result.files.map(file => file.path)).toContain("Presentation.generated.vue");
    expect(result.watchTargets.some(target => target.kind === "file")).toBe(true);
  });

  it("reports diagnostics for invalid source", async () => {
    const root = await project(String.raw`\begin{document}\begin{frame}{X}\Nope\end{frame}\end{document}`);
    const result = await compilePresentation({ sourceFile: join(root, "presentation.rtex") });
    expect(result.hasErrors).toBe(true);
    expect(result.diagnostics.some(d => d.code === "RTX3000")).toBe(true);
    expect(result.files).toEqual([]);
  });

  it("writes output when compiling to a directory", async () => {
    const root = await project(String.raw`\begin{document}\begin{frame}{Hello}World\end{frame}\end{document}`);
    const out = join(root, "out");
    const result = await compileToOutput({ sourceFile: join(root, "presentation.rtex"), outputDirectory: out });
    expect(result.hasErrors).toBe(false);
    const generated = await import("node:fs/promises").then(fs => fs.readFile(join(out, "Presentation.generated.vue"), "utf8"));
    expect(generated).toContain("RevealDeck");
  });
});
