import { Marked, type TokenizerAndRendererExtension } from "marked";
import katex from "katex";

/**
 * Render Markdown to HTML. Rendering happens at build time so the generated
 * presentation stays dependency-free at runtime and both renderers produce the
 * same markup. `$$...$$` and `$...$` are rendered with KaTeX and honour the
 * presentation's math macros.
 */
export function renderMarkdown(source: string, macros: Record<string, string> = {}): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({ extensions: [blockMath(macros), inlineMath(macros)] });
  return marked.parse(source.replace(/^\n/, "").replace(/\n[ \t]*$/, ""), { async: false }) as string;
}

function normalizeMacros(macros: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(macros).map(([name, expansion]) => [name.startsWith("\\") ? name : `\\${name}`, expansion]));
}

function blockMath(macros: Record<string, string>): TokenizerAndRendererExtension {
  return {
    name: "blockMath",
    level: "block",
    start: (src: string) => src.indexOf("$$"),
    tokenizer(src: string) {
      const match = src.match(/^\$\$([\s\S]+?)\$\$/);
      if (match) return { type: "blockMath", raw: match[0], text: match[1].trim() };
      return undefined;
    },
    renderer(token: any) {
      return katex.renderToString(token.text, { displayMode: true, throwOnError: false, strict: "warn", output: "htmlAndMathml", macros: normalizeMacros(macros) });
    }
  };
}

function inlineMath(macros: Record<string, string>): TokenizerAndRendererExtension {
  return {
    name: "inlineMath",
    level: "inline",
    start: (src: string) => src.indexOf("$"),
    tokenizer(src: string) {
      const match = src.match(/^\$([^$\n]+?)\$/);
      if (match) return { type: "inlineMath", raw: match[0], text: match[1] };
      return undefined;
    },
    renderer(token: any) {
      return katex.renderToString(token.text, { displayMode: false, throwOnError: false, strict: "warn", output: "htmlAndMathml", macros: normalizeMacros(macros) });
    }
  };
}
