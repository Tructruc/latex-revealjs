import { describe, expect, it } from "vitest";
import { overlayShouldHide } from "../src/overlays.js";

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
});
