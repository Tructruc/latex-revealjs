import type { HtmlComponentRenderContext } from "../../src/index.js";

export default function renderCard({ props, escape, asset }: HtmlComponentRenderContext): string {
  const icon = typeof props.icon === "string" ? `<img src="${escape(asset(props.icon))}" alt="">` : "";
  return `<article class="custom-card">${icon}${escape(props.label ?? "")}</article>`;
}
