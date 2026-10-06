import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render Markdown to HTML. Rendering happens at build time so the generated
 * presentation stays dependency-free at runtime and both renderers produce the
 * same markup.
 */
export function renderMarkdown(source: string): string {
  return marked.parse(source.replace(/^\n/, "").replace(/\n[ \t]*$/, ""), { async: false }) as string;
}
