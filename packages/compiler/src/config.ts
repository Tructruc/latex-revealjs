import type { SourceLocation } from "./ast.js";
import type { PresentationIR, PresentationNode, PropertyValue } from "./ir.js";

export type PropType = "string" | "number" | "boolean" | "null" | "array" | "object" | "enum" | "color" | "dimension" | "duration" | "asset";
export interface PropSchema { type: PropType; required?: boolean; default?: PropertyValue; values?: string[] }
export interface ComponentDefinition {
  source?: string; vue?: string; lazy?: boolean; portability?: "portable" | "vue-only" | "renderer-specific";
  props?: Record<string, PropSchema>; html?: { renderer?: string }; semanticFallback?: { tag: string; class?: string };
}
export interface LayoutDefinition { source: string; html?: { renderer?: string }; semanticFallback?: { tag?: string; class?: string } }
export interface PluginCommandContext { name: string; options: Record<string, PropertyValue>; argument?: string; arguments: string[]; children: PresentationNode[]; source: SourceLocation }
export interface PluginCommandDefinition {
  component: string;
  props?: Record<string, PropertyValue> | ((context: PluginCommandContext) => Record<string, PropertyValue>);
  preserveChildren?: boolean;
}
export interface RevealTeXPlugin {
  name: string; components?: Record<string, ComponentDefinition>; layouts?: Record<string, LayoutDefinition>;
  commands?: Record<string, PluginCommandDefinition>; environments?: Record<string, PluginCommandDefinition>;
  transformIR?(presentation: PresentationIR): PresentationIR;
}
export interface RevealTeXConfig {
  renderer?: string; source?: string; output?: string; reveal?: Record<string, unknown>;
  theme?: { name?: string; css?: string }; styles?: string[];
  components?: Record<string, ComponentDefinition> & { autoDiscover?: string };
  /** Maps alternative command names onto registered component names. */
  aliases?: Record<string, string>;
  layouts?: Record<string, LayoutDefinition>; presets?: Record<string, { component: string; props?: Record<string, PropertyValue> }>;
  sections?: { autoDividerSlides?: boolean };
  plugins?: RevealTeXPlugin[];
}
export function defineConfig(config: RevealTeXConfig): RevealTeXConfig { return config; }
export const defineRevealTeXConfig = defineConfig;
export function defineComponentMetadata<T extends ComponentDefinition>(metadata: T): T { return metadata; }
