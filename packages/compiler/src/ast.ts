export interface SourcePosition { line: number; column: number; offset: number }
export interface SourceLocation { file: string; start: SourcePosition; end: SourcePosition }

export interface AstBase { type: string; location: SourceLocation }
export interface TextNode extends AstBase { type: "text"; value: string }
export interface MathNode extends AstBase { type: "math"; display: boolean; source: string }
export interface ArgumentNode extends AstBase { type: "argument"; children: AstNode[]; raw: string }
export interface CommandNode extends AstBase {
  type: "command";
  name: string;
  overlay?: string;
  optionalArguments: ArgumentNode[];
  requiredArguments: ArgumentNode[];
}
export interface EnvironmentNode extends AstBase {
  type: "environment";
  name: string;
  overlay?: string;
  optionalArguments: ArgumentNode[];
  requiredArguments: ArgumentNode[];
  children: AstNode[];
  raw?: string;
}
export interface DocumentNode extends AstBase { type: "document"; children: AstNode[] }
export type AstNode = TextNode | MathNode | CommandNode | EnvironmentNode;
