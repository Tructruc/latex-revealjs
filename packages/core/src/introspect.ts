import type { PropSchema } from "@revealtex/compiler";

type PropType = PropSchema["type"];

/**
 * Best-effort static extraction of a Vue SFC's declared props. Used by the CLI
 * so auto-discovered components get prop validation without duplicating the
 * schema in `revealtex.config.ts`. Only simple, unambiguous declarations are
 * recognised; anything more complex disables introspection for the component
 * rather than risking false validation errors.
 */
export function introspectVueProps(source: string): Record<string, PropSchema> {
  const script = extractSetupScript(source);
  if (!script) return {};
  const typeProps = parseTypeProps(script);
  if (typeProps === undefined) return {};
  const runtimeProps = parseRuntimeProps(script);
  return { ...runtimeProps, ...typeProps };
}

function extractSetupScript(source: string): string | undefined {
  const setup = source.match(/<script\b[^>]*\bsetup\b[^>]*>([\s\S]*?)<\/script>/i);
  if (setup) return setup[1];
  const generic = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  return generic?.[1];
}

function parseTypeProps(script: string): Record<string, PropSchema> | undefined {
  const call = script.indexOf("defineProps");
  if (call < 0) return {};
  const afterCall = script.slice(call + "defineProps".length).trimStart();
  if (!afterCall.startsWith("<")) return {};
  const angle = script.indexOf("<", call + "defineProps".length);
  if (angle < 0) return {};
  const typeParam = readBalanced(script, angle, "<", ">");
  if (typeParam === undefined) return {};
  let body = typeParam.trim();
  if (!body.startsWith("{")) {
    const name = body.replace(/[^A-Za-z0-9_$]/g, "");
    const source = name ? findTypeBody(script, name) : undefined;
    if (!source) return {};
    body = source;
  }
  const members = innerMembers(body);
  if (members === undefined) return {};
  const props: Record<string, PropSchema> = {};
  const defaults = parseDefaults(script);
  for (const member of members) {
    const match = member.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*(\?)?\s*:\s*([\s\S]+)$/);
    if (!match) continue;
    const name = match[1] ?? match[2] ?? match[3]!;
    const optional = Boolean(match[4]);
    const schema = mapType(match[5]!);
    if (!schema) return undefined;
    if (optional) schema.required = false;
    else schema.required = true;
    if (defaults[name] !== undefined) { schema.default = defaults[name]; schema.required = false; }
    props[name] = schema;
  }
  return props;
}

function parseRuntimeProps(script: string): Record<string, PropSchema> {
  const props: Record<string, PropSchema> = {};
  const call = script.indexOf("defineProps");
  const paren = call < 0 ? -1 : script.indexOf("(", call);
  if (paren < 0 || script.slice(call, paren).includes("<")) return props;
  const body = readBalanced(script, paren, "(", ")");
  if (!body || !body.trim().startsWith("{")) return props;
  const members = innerMembers(body);
  if (members === undefined) return props;
  for (const member of members) {
    const match = member.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/);
    if (!match) continue;
    const name = match[1] ?? match[2] ?? match[3]!;
    const value = match[4]!;
    const shorthand = value.match(/^\{\s*type\s*:\s*(String|Number|Boolean|Array|Object)\s*(,[\s\S]*)?\}$/);
    if (shorthand) {
      const map: Record<string, PropType> = { String: "string", Number: "number", Boolean: "boolean", Array: "array", Object: "object" };
      const schema: PropSchema = { type: map[shorthand[1]!]! };
      if (/required\s*:\s*true/.test(value)) schema.required = true;
      props[name] = schema;
    } else if (/^(String|Number|Boolean)$/.test(value.trim())) {
      props[name] = { type: value.trim() === "String" ? "string" : value.trim() === "Number" ? "number" : "boolean" };
    }
  }
  return props;
}

function findTypeBody(script: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const typeAlias = new RegExp(`\\btype\\s+${escaped}\\s*=\\s*\\{`).exec(script);
  const interfaceDef = new RegExp(`\\binterface\\s+${escaped}\\b[^{]*\\{`).exec(script);
  const match = typeAlias ?? interfaceDef;
  if (!match) return undefined;
  const brace = script.indexOf("{", match.index);
  return readBalanced(script, brace, "{", "}");
}

function parseDefaults(script: string): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};
  const call = script.indexOf("withDefaults");
  if (call < 0) return defaults;
  const paren = script.indexOf("(", call);
  const outer = readBalanced(script, paren, "(", ")");
  if (!outer) return defaults;
  const commaIndex = findTopLevelComma(outer);
  if (commaIndex < 0) return defaults;
  const objectBody = outer.slice(commaIndex + 1).trim();
  if (!objectBody.startsWith("{")) return defaults;
  const inner = readBalanced(objectBody, 0, "{", "}");
  if (!inner) return defaults;
  for (const member of splitMembers(inner)) {
    const match = member.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/);
    if (!match) continue;
    const name = match[1] ?? match[2] ?? match[3]!;
    const raw = match[4]!.trim();
    if (/^(true|false)$/.test(raw)) defaults[name] = raw === "true";
    else if (/^[+-]?\d+(\.\d+)?$/.test(raw)) defaults[name] = Number(raw);
    else if (/^["'`].*["'`]$/.test(raw)) defaults[name] = raw.slice(1, -1);
  }
  return defaults;
}

function mapType(raw: string): PropSchema | undefined {
  let type = raw.trim().replace(/,$/, "").trim();
  while (type.startsWith("(") && type.endsWith(")")) type = type.slice(1, -1).trim();
  const union = type.split("|").map(part => part.trim()).filter(Boolean);
  if (union.length > 1 && union.every(part => /^["'].*["']$/.test(part))) {
    return { type: "enum", values: union.map(part => part.slice(1, -1)) };
  }
  if (/\[\]$/.test(type) || /^Array</.test(type) || /^ReadonlyArray</.test(type)) return { type: "array" };
  if (type.startsWith("{") || type.startsWith("Record<") || type === "object") return { type: "object" };
  if (type === "string") return { type: "string" };
  if (type === "number") return { type: "number" };
  if (type === "boolean") return { type: "boolean" };
  if (type === "null") return { type: "null" };
  return undefined;
}

function innerMembers(body: string): string[] | undefined {
  const text = body.trim();
  if (!text.startsWith("{")) return splitMembers(text);
  const inner = readBalanced(text, 0, "{", "}");
  return inner === undefined ? undefined : splitMembers(inner);
}

function splitMembers(body: string): string[] {
  const members: string[] = []; let current = ""; let depth = 0; let quote = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    if (quote) { current += char; if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; current += char; continue; }
    if ("{[(".includes(char)) depth++;
    else if ("}])".includes(char)) depth--;
    if (depth === 0 && (char === ";" || char === "," || char === "\n")) { if (current.trim()) members.push(current.trim()); current = ""; continue; }
    current += char;
  }
  if (current.trim()) members.push(current.trim());
  return members;
}

function findTopLevelComma(body: string): number {
  let depth = 0; let quote = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if ("{[(".includes(char)) depth++;
    else if ("}])".includes(char)) depth--;
    else if (char === "," && depth === 0) return i;
  }
  return -1;
}

function readBalanced(source: string, start: number, open: string, close: string): string | undefined {
  if (start < 0 || source[start] !== open) return undefined;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i]!;
    if (char === open) depth++;
    else if (char === close) { depth--; if (depth === 0) return source.slice(start + 1, i); }
  }
  return undefined;
}
