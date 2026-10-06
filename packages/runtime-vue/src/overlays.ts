/**
 * Reveal re-indexes fragments from 0 in document order. Overlay 1 is the
 * initial state, so the first revealed fragment maps to overlay 2.
 */
export function currentOverlayNumber(root: ParentNode | null | undefined): number {
  const slide = root ?? null;
  if (!slide) return 1;
  const current = slide.querySelector(".current-fragment");
  if (!current) return 1;
  const raw = current.getAttribute("data-fragment-index");
  if (raw !== null) return (parseInt(raw, 10) || 0) + 2;
  return slide.querySelectorAll(".fragment.visible").length + 1;
}

/**
 * Decide whether an element with the given overlay window should be removed
 * from layout. `\only` elements are hidden both before and after their window;
 * ranged elements are only hidden after it. Endless ranges are never hidden.
 */
export function overlayShouldHide(overlay: number, start: number, end: number, only: boolean): boolean {
  const visible = overlay >= start && overlay <= end;
  if (only) return !visible;
  if (end !== Infinity) return overlay > end;
  return false;
}

export function applyOverlayVisibility(root: ParentNode | null | undefined, overlay: number, shouldHide: typeof overlayShouldHide = overlayShouldHide): void {
  root?.querySelectorAll<HTMLElement>("[data-rt-overlay-start],[data-rt-overlay-end]").forEach(element => {
    const start = Number(element.dataset.rtOverlayStart ?? "1");
    const end = element.dataset.rtOverlayEnd !== undefined ? Number(element.dataset.rtOverlayEnd) : Infinity;
    element.classList.toggle("rt-overlay-hidden", shouldHide(overlay, start, end, element.classList.contains("rt-only")));
  });
}
