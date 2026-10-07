import { describe, expect, it } from "vitest";
import { applyOverlayVisibility, overlayInWindows, overlayShouldHide, parseOverlayWindowsAttr } from "../src/overlays.js";

function fakeElement(dataset: Record<string, string>, classes: string[] = []) {
  const set = new Set(classes);
  return {
    dataset,
    hidden: false,
    classList: {
      contains: (name: string) => set.has(name),
      has: (name: string) => set.has(name),
      toggle: (name: string, on: boolean) => { if (on) set.add(name); else set.delete(name); return on; }
    }
  };
}

describe("overlay visibility", () => {
  it("hides `only` content outside its window", () => {
    expect(overlayShouldHide(1, 2, Infinity, true)).toBe(true);
    expect(overlayShouldHide(2, 2, Infinity, true)).toBe(false);
    expect(overlayShouldHide(4, 2, 3, true)).toBe(true);
    expect(overlayShouldHide(3, 2, 3, true)).toBe(false);
    expect(overlayShouldHide(2, 2, 3, true)).toBe(false);
  });

  it("only hides ranged (non-only) content after its window", () => {
    expect(overlayShouldHide(1, 2, 4, false)).toBe(false);
    expect(overlayShouldHide(4, 2, 4, false)).toBe(false);
    expect(overlayShouldHide(5, 2, 4, false)).toBe(true);
  });

  it("never hides endless non-only content", () => {
    expect(overlayShouldHide(1, 2, Infinity, false)).toBe(false);
    expect(overlayShouldHide(99, 2, Infinity, false)).toBe(false);
  });

  it("applies visibility to start/end, only, and window elements", () => {
    const ranged = fakeElement({ rtOverlayStart: "2", rtOverlayEnd: "4" });
    const only = fakeElement({ rtOverlayStart: "2", rtOverlayEnd: "2" }, ["rt-only"]);
    const windows = fakeElement({ rtOverlayWindows: "2:2,4:4" });
    const root = { querySelectorAll: () => [ranged, only, windows] } as unknown as ParentNode;

    applyOverlayVisibility(root, 3);
    expect(only.classList.has("rt-overlay-hidden")).toBe(true);
    expect(windows.classList.has("rt-overlay-hidden")).toBe(true);
    expect(ranged.classList.has("rt-overlay-hidden")).toBe(false);

    applyOverlayVisibility(root, 4);
    expect(only.classList.has("rt-overlay-hidden")).toBe(true);
    expect(windows.classList.has("rt-overlay-hidden")).toBe(false);
    expect(ranged.classList.has("rt-overlay-hidden")).toBe(false);

    applyOverlayVisibility(root, 5);
    expect(ranged.classList.has("rt-overlay-hidden")).toBe(true);
  });

  it("parses and evaluates non-contiguous overlay windows", () => {
    const windows = parseOverlayWindowsAttr("2:4,6:");
    expect(windows).toEqual([{ start: 2, end: 4 }, { start: 6, end: undefined }]);
    expect(overlayInWindows(2, windows)).toBe(true);
    expect(overlayInWindows(4, windows)).toBe(true);
    expect(overlayInWindows(5, windows)).toBe(false);
    expect(overlayInWindows(7, windows)).toBe(true);
  });
});
