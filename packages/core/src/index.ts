import { rendererRegistry } from "@revealtex/renderer-core";
import { VueRenderer } from "@revealtex/renderer-vue";
import { HtmlRenderer } from "@revealtex/renderer-html";

rendererRegistry.register(new VueRenderer()).register(new HtmlRenderer());

export type * from "@revealtex/compiler";
export * from "@revealtex/renderer-core";
export * from "./introspect.js";
export * from "./config.js";
export * from "./output.js";
export * from "./scaffold.js";
export * from "./watch.js";
export * from "./compile.js";
