import type { HtmlComponentRenderContext } from "@revealtex/renderer-html";

export default function renderAssetPreview({ props, escape, asset }: HtmlComponentRenderContext): string {
  const source = asset(props.source ?? "");
  const label = escape(props.label ?? "Imported presentation asset");
  return `<figure class="asset-preview-html"><img src="${escape(source)}" alt="${label}"><figcaption>${label}</figcaption></figure>`;
}
