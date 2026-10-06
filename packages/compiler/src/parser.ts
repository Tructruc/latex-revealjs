import type { ArgumentNode, AstNode, CommandNode, DocumentNode, EnvironmentNode, MathNode, SourceLocation, SourcePosition, TextNode } from "./ast.js";
import { RevealTeXError } from "./diagnostics.js";

const RAW_ENVIRONMENTS = new Set(["code", "verbatim", "lstlisting", "vue", "html", "react", "mermaid", "table", "tabular", "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "split", "aligned", "gathered", "displaymath", "math", "eqnarray", "eqnarray*"]);

export class Parser {
  private offset = 0;
  private line = 1;
  private column = 1;
  constructor(private readonly source: string, private readonly file = "<input>") {}

  parse(): DocumentNode {
    const start = this.position();
    const children = this.parseNodes();
    return { type: "document", children, location: this.location(start) };
  }

  private parseNodes(stopEnvironment?: string, stopChar?: string): AstNode[] {
    const nodes: AstNode[] = [];
    let text = "";
    let textStart = this.position();
    const flush = () => {
      if (text) nodes.push({ type: "text", value: text, location: this.location(textStart) } satisfies TextNode);
      text = ""; textStart = this.position();
    };
    while (!this.eof()) {
      if (stopChar && this.peek() === stopChar) break;
      if (stopEnvironment && this.source.startsWith("\\end", this.offset) && this.isClosingEnvironment(stopEnvironment)) break;
      const c = this.peek();
      if (c === "%" && this.peek(-1) !== "\\") {
        flush();
        while (!this.eof() && this.peek() !== "\n") this.advance();
        textStart = this.position();
      } else if (c === "\\") {
        if (this.source.startsWith("\\[", this.offset)) { flush(); nodes.push(this.parseDisplayMath()); textStart = this.position(); }
        else { flush(); const node = this.parseCommandOrEnvironment(); if (node) nodes.push(node); textStart = this.position(); }
      } else if (c === "$") {
        flush();
        nodes.push(this.source.startsWith("$$", this.offset) ? this.parseDoubleDollarMath() : this.parseInlineMath());
        textStart = this.position();
      } else {
        text += this.advance();
      }
    }
    flush();
    return nodes;
  }

  private parseCommandOrEnvironment(): AstNode | undefined {
    const start = this.position();
    this.expect("\\");
    if (!/[A-Za-z@]/.test(this.peek())) {
      const escaped = this.advance();
      return { type: "text", value: escaped, location: this.location(start) };
    }
    const name = this.readWhile(/[A-Za-z@]/);
    if (name === "begin") return this.parseEnvironment(start);
    if (name === "end") this.fail("RTX1002", "Unexpected \\end without a matching \\begin.", start);
    const command: CommandNode = { type: "command", name, optionalArguments: [], requiredArguments: [], location: this.location(start) };
    this.skipWhitespace();
    if (this.peek() === "<") command.overlay = this.readBalanced("<", ">").raw.trim();
    this.skipWhitespace();
    while (this.peek() === "[" || this.peek() === "{") {
      if (this.peek() === "[") command.optionalArguments.push(this.parseArgument("[", "]"));
      else command.requiredArguments.push(this.parseArgument("{", "}"));
      this.skipWhitespace();
    }
    command.location = this.location(start);
    return command;
  }

  private parseEnvironment(start: SourcePosition): EnvironmentNode {
    this.skipWhitespace();
    if (this.peek() !== "{") this.fail("RTX1003", "Expected an environment name after \\begin.", start);
    const nameArg = this.parseArgument("{", "}");
    const name = nameArg.raw.trim();
    const optionalArguments: ArgumentNode[] = [];
    const requiredArguments: ArgumentNode[] = [];
    this.skipWhitespace();
    while (this.peek() === "[") { optionalArguments.push(this.parseArgument("[", "]")); this.skipWhitespace(); }
    while (this.peek() === "{") { requiredArguments.push(this.parseArgument("{", "}")); this.skipWhitespace(); }
    if (RAW_ENVIRONMENTS.has(name)) {
      const marker = `\\end{${name}}`;
      const end = this.source.indexOf(marker, this.offset);
      if (end < 0) this.fail("RTX1004", `Unclosed environment \\begin{${name}}.`, start, `Expected \\end{${name}}.`);
      const rawStart = this.position();
      let raw = "";
      while (this.offset < end) raw += this.advance();
      this.consume(marker);
      return { type: "environment", name, optionalArguments, requiredArguments, children: [], raw, location: this.location(start) };
    }
    const children = this.parseNodes(name);
    if (this.eof()) this.fail("RTX1004", `Unclosed environment \\begin{${name}}.`, start, `Expected \\end{${name}}.`);
    this.consume(`\\end{${name}}`);
    return { type: "environment", name, optionalArguments, requiredArguments, children, location: this.location(start) };
  }

  private parseArgument(open: string, close: string): ArgumentNode {
    const start = this.position();
    const { raw } = this.readBalanced(open, close);
    const inner = raw;
    const nested = new Parser(inner, this.file).parse().children;
    // Offset nested locations into the parent file for useful diagnostics.
    const contentStart = { line: start.line, column: start.column + 1, offset: start.offset + 1 };
    shiftNodes(nested, contentStart);
    return { type: "argument", raw: inner, children: nested, location: this.location(start) };
  }

  private readBalanced(open: string, close: string): { raw: string } {
    const start = this.position(); this.expect(open); let depth = 1; let raw = "";
    while (!this.eof()) {
      const c = this.advance();
      if (c === "\\" && !this.eof()) { raw += c + this.advance(); continue; }
      if (c === open) depth++;
      if (c === close && --depth === 0) return { raw };
      raw += c;
    }
    this.fail("RTX1001", `Unclosed '${open}' argument.`, start, `Expected '${close}'.`);
  }

  private parseInlineMath(): MathNode {
    const start = this.position(); this.expect("$"); let source = "";
    while (!this.eof() && this.peek() !== "$") { const c = this.advance(); source += c === "\\" && !this.eof() ? c + this.advance() : c; }
    if (this.eof()) this.fail("RTX1005", "Unclosed inline math expression.", start, "Expected '$'.");
    this.expect("$"); return { type: "math", display: false, source, location: this.location(start) };
  }
  private parseDisplayMath(): MathNode {
    const start = this.position(); this.consume("\\["); let source = "";
    while (!this.eof() && !this.source.startsWith("\\]", this.offset)) source += this.advance();
    if (this.eof()) this.fail("RTX1006", "Unclosed display math expression.", start, "Expected '\\]'.");
    this.consume("\\]"); return { type: "math", display: true, source: source.trim(), location: this.location(start) };
  }
  private parseDoubleDollarMath(): MathNode {
    const start = this.position(); this.consume("$$"); let source = "";
    while (!this.eof() && !this.source.startsWith("$$", this.offset)) source += this.advance();
    if (this.eof()) this.fail("RTX1006", "Unclosed display math expression.", start, "Expected '$$'.");
    this.consume("$$"); return { type: "math", display: true, source: source.trim(), location: this.location(start) };
  }
  private isClosingEnvironment(name: string): boolean { return this.source.startsWith(`\\end{${name}}`, this.offset); }
  private position(): SourcePosition { return { line: this.line, column: this.column, offset: this.offset }; }
  private location(start: SourcePosition): SourceLocation { return { file: this.file, start, end: this.position() }; }
  private peek(delta = 0): string { return this.source[this.offset + delta] ?? ""; }
  private eof(): boolean { return this.offset >= this.source.length; }
  private advance(): string { const c = this.source[this.offset++] ?? ""; if (c === "\n") { this.line++; this.column = 1; } else this.column++; return c; }
  private consume(s: string): void { for (const c of s) { if (this.peek() !== c) this.fail("RTX1000", `Expected '${s}'.`, this.position()); this.advance(); } }
  private expect(s: string): void { this.consume(s); }
  private readWhile(pattern: RegExp): string { let out = ""; while (!this.eof() && pattern.test(this.peek())) out += this.advance(); return out; }
  private skipWhitespace(): void { while (/\s/.test(this.peek())) this.advance(); }
  private fail(code: string, message: string, start: SourcePosition, hint?: string): never { throw new RevealTeXError({ severity: "error", code, message, hint, location: this.location(start) }); }
}

function shiftNodes(nodes: AstNode[], base: SourcePosition): void {
  for (const node of nodes) {
    for (const key of ["start", "end"] as const) {
      const pos = node.location[key];
      pos.offset += base.offset;
      pos.line += base.line - 1;
      if (pos.line === base.line) pos.column += base.column - 1;
    }
    if (node.type === "command") for (const a of [...node.optionalArguments, ...node.requiredArguments]) shiftNodes(a.children, base);
    if (node.type === "environment") shiftNodes(node.children, base);
  }
}

export function parse(source: string, file?: string): DocumentNode { return new Parser(source, file).parse(); }
