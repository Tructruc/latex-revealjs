import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AstNode, DocumentNode, EnvironmentNode } from "./ast.js";
import { RevealTeXError } from "./diagnostics.js";
import { parse } from "./parser.js";

export async function parseFileWithIncludes(entry: string): Promise<{ ast: DocumentNode; sourceFiles: string[] }> {
  const sourceFiles: string[] = []; const active: string[] = [];
  const load = async (file: string): Promise<DocumentNode> => {
    const absolute = resolve(file);
    if (active.includes(absolute)) throw new RevealTeXError({ severity: "error", code: "RTX2001", message: `Circular include detected: ${[...active, absolute].join(" -> ")}.` });
    active.push(absolute); if (!sourceFiles.includes(absolute)) sourceFiles.push(absolute);
    const document = parse(await readFile(absolute, "utf8"), absolute);
    document.children = await expand(document.children, absolute, load);
    active.pop(); return document;
  };
  return { ast: await load(entry), sourceFiles };
}
async function expand(nodes: AstNode[], owner: string, load: (file: string) => Promise<DocumentNode>): Promise<AstNode[]> {
  const output: AstNode[] = [];
  for (const node of nodes) {
    if (node.type === "command" && (node.name === "input" || node.name === "include" || node.name === "subimport" || node.name === "import")) {
      const requested = (node.name === "subimport" || node.name === "import") ? node.requiredArguments[1]?.raw.trim() : node.requiredArguments[0]?.raw.trim();
      if (!requested) throw new RevealTeXError({ severity: "error", code: "RTX2002", message: `\\${node.name} requires a file path.`, location: node.location });
      const included = await load(resolve(dirname(owner), requested)); output.push(...included.children); continue;
    }
    if (node.type === "environment") (node as EnvironmentNode).children = await expand(node.children, owner, load);
    output.push(node);
  }
  return output;
}
