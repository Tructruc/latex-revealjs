import type { PropertyValue } from "./ir.js";

/**
 * Frame options that RevealTeX interprets structurally. Everything else in a
 * frame option list is treated as a Reveal passthrough attribute so authors can
 * reach any reveal.js feature without waiting for first-class support.
 */
const STRUCTURAL_OPTIONS = new Set([
  "id",
  "transition",
  "transition-speed",
  "autoanimate",
  "auto-animate",
  "center",
  "layout",
  "class",
  "style",
  "background",
  "background-color",
  "background-image",
  "background-gradient",
  "background-video",
  "background-iframe",
  "background-size",
  "background-position",
  "background-repeat",
  "background-opacity",
  "background-transition",
  "background-video-loop",
  "background-video-muted",
  "background-interactive",
  "titleSlide",
  "sectionDivider",
  "fragile",
  "plain",
  "shrink",
  "squeeze",
  "allowframebreaks",
  "handout",
  "t",
  "c",
  "b",
  "label",
  "noframenumbering"
]);

/**
 * Convert remaining frame options into `data-*` attributes for Reveal.
 * Keys that already look like HTML attributes (`data-`, `aria-`) are passed
 * through untouched. Boolean `true` emits a valueless attribute; `false`,
 * `null` and `undefined` are skipped.
 */
export function revealAttributes(options: Record<string, PropertyValue>): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(options)) {
    if (STRUCTURAL_OPTIONS.has(key)) continue;
    if (value === undefined || value === null || value === false) continue;
    const name = key.startsWith("data-") || key.startsWith("aria-") ? key : `data-${key}`;
    attributes[name] = value === true ? "" : String(value);
  }
  return attributes;
}
