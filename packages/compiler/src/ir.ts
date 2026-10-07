import type { SourceLocation } from "./ast.js";

export type PropertyValue = string | number | boolean | null | PropertyValue[] | { [key: string]: PropertyValue };
export interface PresentationMetadata { title?: string; subtitle?: string; author?: string; institute?: string; date?: string; description?: string; titlegraphic?: string; logo?: string }
export interface PresentationConfiguration {
  theme?: string; transition?: string; transitionSpeed?: string; controls?: boolean; progress?: boolean; slideNumbers?: boolean;
  reveal?: Record<string, PropertyValue>;
  stylesheets: string[]; scripts: string[]; mathMacros: Record<string, string>;
}
export interface BaseIR { type: string; source: SourceLocation }
export interface TextIR extends BaseIR { type: "text"; value: string }
export interface ParagraphIR extends BaseIR { type: "paragraph"; children: PresentationNode[] }
export interface MathIR extends BaseIR { type: "math"; display: boolean; tex: string }
export interface FormattingIR extends BaseIR { type: "format"; style: string; options?: Record<string, PropertyValue>; children: PresentationNode[] }
export interface OverlayWindow { start: number; end?: number }
export interface FragmentIR extends BaseIR {
  type: "fragment"; effect?: string;
  /** Reveal fragment index (1-based ordering). */
  index?: number;
  /** First Beamer overlay this content is visible on (defaults to `index + 1`). */
  start?: number;
  /** Last Beamer overlay this content is visible on (undefined = forever). */
  end?: number;
  /** Non-contiguous visibility windows (e.g. `<2,4>`); overrides start/end. */
  windows?: OverlayWindow[];
  /** When true the element is removed from layout while hidden (`\only`). */
  only?: boolean;
  children: PresentationNode[];
}
export interface AnimationIR extends BaseIR { type: "animation"; effect: string; duration?: string; delay?: string; easing?: string; children: PresentationNode[] }
export interface ListItemIR extends BaseIR { type: "list-item"; index?: number; start?: number; end?: number; windows?: OverlayWindow[]; only?: boolean; children: PresentationNode[] }
export interface ListIR extends BaseIR { type: "list"; ordered: boolean; items: ListItemIR[] }
export interface ColumnIR extends BaseIR { type: "column"; width?: string; children: PresentationNode[] }
export interface ColumnsIR extends BaseIR { type: "columns"; gap?: string; alignment?: string; columns: ColumnIR[] }
export interface MediaIR extends BaseIR { type: "image" | "video" | "svg"; src: string; options: Record<string, PropertyValue> }
export interface CodeIR extends BaseIR { type: "code"; code: string; language?: string; options: Record<string, PropertyValue> }
export interface DiagramIR extends BaseIR { type: "diagram"; kind: string; code: string; options: Record<string, PropertyValue> }
export interface MarkdownIR extends BaseIR { type: "markdown"; content: string }
export interface LinkIR extends BaseIR { type: "link"; href: string; children: PresentationNode[] }
export interface TableIR extends BaseIR { type: "table"; rows: string[][]; header: boolean; caption?: string; options: Record<string, PropertyValue> }
export interface SlotIR extends BaseIR { type: "slot"; name: string; children: PresentationNode[] }
export interface NotesIR extends BaseIR { type: "notes"; children: PresentationNode[] }
export interface ComponentIR extends BaseIR { type: "component"; name: string; props: Record<string, PropertyValue>; slots: Record<string, PresentationNode[]>; children: PresentationNode[] }
export interface ElementIR extends BaseIR { type: "element"; id?: string; options: Record<string, PropertyValue>; children: PresentationNode[] }
export interface RawRendererBlockIR extends BaseIR { type: "renderer-specific"; renderer: string; content: string }
export interface ContainerIR extends BaseIR { type: "container"; kind: string; options: Record<string, PropertyValue>; children: PresentationNode[] }
export interface SlideBackground {
  color?: string; image?: string; gradient?: string; video?: string; iframe?: string;
  size?: string; position?: string; repeat?: string; opacity?: string | number; transition?: string;
  videoLoop?: boolean; videoMuted?: boolean; interactive?: boolean;
}
export interface SlideIR extends BaseIR {
  type: "slide"; id: string; title?: PresentationNode[]; subtitle?: PresentationNode[]; transition?: { effect?: string; speed?: string }; autoAnimate?: boolean;
  center?: boolean; layout?: string; background?: SlideBackground;
  options: Record<string, PropertyValue>;
  /** Extra Reveal-style attributes (already prefixed, e.g. {"data-state":"x"}). */
  attributes: Record<string, string>;
  children: PresentationNode[]; notes?: PresentationNode[];
}
export interface SectionIR extends BaseIR { type: "section"; title?: string; slides: SlideIR[] }
export interface SlideStackIR extends BaseIR { type: "slide-stack"; title?: string; slides: SlideIR[]; transition?: { effect?: string; speed?: string }; attributes?: Record<string, string> }
export type NavigationIR = SlideIR | SlideStackIR;
export type PresentationNode = TextIR | ParagraphIR | MathIR | FormattingIR | FragmentIR | AnimationIR | ListIR | ListItemIR | ColumnsIR | ColumnIR | MediaIR | CodeIR | DiagramIR | MarkdownIR | LinkIR | TableIR | SlotIR | NotesIR | ComponentIR | ElementIR | RawRendererBlockIR | ContainerIR;
export interface AssetReference { kind: "image" | "video" | "svg" | "stylesheet" | "script" | "data"; path: string; source: SourceLocation }
export interface PresentationIR {
  type: "presentation"; metadata: PresentationMetadata; configuration: PresentationConfiguration; slides: SlideIR[]; sections: SectionIR[];
  navigation: NavigationIR[]; assets: AssetReference[]; sourceFiles: string[];
}
