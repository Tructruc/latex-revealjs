import type { HtmlComponentRenderContext } from "@revealtex/renderer-html";

export default function renderMetricCard({ props, escape }: HtmlComponentRenderContext): string {
  const label = escape(props.label ?? "Metric");
  const trend = typeof props.trend === "number"
    ? `<small class="metric-html__trend">${props.trend > 0 ? "+" : ""}${escape(props.trend)}%</small>`
    : "";
  return `<article class="rt-card metric-html" aria-label="${label} metric"><strong>${escape(props.value)}${escape(props.suffix ?? "")}</strong><span>${label}</span>${trend}</article>`;
}
