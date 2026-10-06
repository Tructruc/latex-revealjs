export * from "./ast.js";
export * from "./attributes.js";
export * from "./config.js";
export * from "./diagnostics.js";
export * from "./ir.js";
export * from "./includes.js";
export * from "./options.js";
export * from "./parser.js";
export * from "./semantic.js";
export * from "./themes.js";

import type { RevealTeXConfig } from "./config.js";
import { parse } from "./parser.js";
import { analyze } from "./semantic.js";
export function compile(source: string, options: { file?: string; config?: RevealTeXConfig } = {}) {
  const ast = parse(source, options.file);
  return { ast, ...analyze(ast, options.config, [options.file ?? "<input>"]) };
}
