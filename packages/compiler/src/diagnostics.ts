import type { SourceLocation } from "./ast.js";

export type DiagnosticSeverity = "error" | "warning" | "info";
export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  location?: SourceLocation;
  hint?: string;
}
export class RevealTeXError extends Error {
  constructor(public readonly diagnostic: Diagnostic) { super(diagnostic.message); this.name = "RevealTeXError"; }
}
export function formatDiagnostic(d: Diagnostic): string {
  const at = d.location ? `${d.location.file}:${d.location.start.line}:${d.location.start.column}\n\n` : "";
  return `${at}${d.severity.toUpperCase()} ${d.code}: ${d.message}${d.hint ? `\n\n${d.hint}` : ""}`;
}
