import type { PropertyValue } from "./ir.js";

export function parseOptions(source = ""): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {};
  for (const part of splitTopLevel(source, ",")) {
    const trimmed = part.trim(); if (!trimmed) continue;
    const eq = findTopLevel(trimmed, "=");
    if (eq < 0) result[trimmed] = true;
    else result[trimmed.slice(0, eq).trim()] = parseValue(trimmed.slice(eq + 1).trim());
  }
  return result;
}
export function parseValue(raw: string): PropertyValue {
  const value = unwrapBraces(raw.trim()).replace(/\\%/g, "%");
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try { return JSON.parse(value) as PropertyValue; } catch { /* retain as string */ }
  }
  return value;
}
export function splitTopLevel(source: string, delimiter: string): string[] {
  const out: string[] = []; let current = ""; const stack: string[] = []; let quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quote) { current += c; if (c === quote && source[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; current += c; continue; }
    if ("{[(".includes(c)) stack.push(c);
    if ("}])".includes(c)) stack.pop();
    if (c === delimiter && stack.length === 0) { out.push(current); current = ""; } else current += c;
  }
  out.push(current); return out;
}
function findTopLevel(source: string, needle: string): number {
  let depth = 0;
  for (let i = 0; i < source.length; i++) { const c = source[i]!; if ("{[(".includes(c)) depth++; else if ("}])".includes(c)) depth--; else if (c === needle && depth === 0) return i; }
  return -1;
}
function unwrapBraces(value: string): string {
  if (!(value.startsWith("{") && value.endsWith("}"))) return value;
  let depth = 0;
  for (let i = 0; i < value.length; i++) { if (value[i] === "{") depth++; if (value[i] === "}" && --depth === 0 && i !== value.length - 1) return value; }
  return value.slice(1, -1).trim();
}
