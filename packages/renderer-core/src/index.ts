import type { Diagnostic, PresentationIR, RevealTeXConfig } from "@revealtex/compiler";
export interface RendererCapabilities { fragments: boolean; transitions: boolean; autoAnimate: boolean; speakerNotes: boolean; customComponents: boolean; interactiveComponents: boolean; rawHtml: boolean; rendererSpecificBlocks: boolean }
export interface RenderContext { sourceFile: string; outputDirectory: string; config: RevealTeXConfig }
export interface GeneratedFile { path: string; content: string | Uint8Array }
export interface RenderResult { files: GeneratedFile[]; diagnostics: Diagnostic[]; dependencies?: string[] }
export interface PresentationRenderer { readonly name: string; readonly capabilities: RendererCapabilities; render(presentation: PresentationIR, context: RenderContext): Promise<RenderResult> }
export class RendererRegistry {
  private readonly renderers = new Map<string, PresentationRenderer>();
  register(renderer: PresentationRenderer): this { this.renderers.set(renderer.name, renderer); return this; }
  get(name: string): PresentationRenderer | undefined { return this.renderers.get(name); }
  names(): string[] { return [...this.renderers.keys()].sort(); }
}
export const rendererRegistry = new RendererRegistry();
export function registerRenderer(renderer: PresentationRenderer): void { rendererRegistry.register(renderer); }
