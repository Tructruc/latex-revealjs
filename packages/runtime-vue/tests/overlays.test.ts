import { describe, expect, it } from "vitest";
import { overlayInWindows, overlayShouldHide, parseOverlayWindowsAttr } from "../src/overlays.js";

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

  it("parses and evaluates non-contiguous overlay windows", () => {
    const windows = parseOverlayWindowsAttr("2:4,6:");
    expect(windows).toEqual([{ start: 2, end: 4 }, { start: 6, end: undefined }]);
    expect(overlayInWindows(2, windows)).toBe(true);
    expect(overlayInWindows(4, windows)).toBe(true);
    expect(overlayInWindows(5, windows)).toBe(false);
    expect(overlayInWindows(7, windows)).toBe(true);
  });
});
