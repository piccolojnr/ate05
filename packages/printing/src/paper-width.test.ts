import { describe, expect, it } from "vitest";
import { dotsToMillimetres, millimetresToDots } from "./paper-width";

describe("printer paper width", () => {
  it("converts standard widths at 203 DPI", () => {
    expect(millimetresToDots(58)).toBe(464);
    expect(millimetresToDots(80)).toBe(639);
  });

  it("supports inverse conversion for display", () => {
    expect(dotsToMillimetres(639)).toBeCloseTo(79.95, 2);
  });
});
