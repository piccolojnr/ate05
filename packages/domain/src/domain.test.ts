import { describe, expect, it } from "vitest";
import { money, multiplyMoney } from "./money";
import { calculateOrderTotals } from "./orders";
import { normalizePriceOptionName, validateMenuPricing } from "./menu";

describe("domain package", () => {
  it("loads without infrastructure dependencies", () => {
    expect(true).toBe(true);
  });
});

describe("menu pricing", () => {
  it("normalizes option names and rejects invalid option configurations", () => {
    expect(normalizePriceOptionName("  FAMILY   Size ")).toBe("family size");
    expect(() =>
      validateMenuPricing({
        pricingMode: "options",
        sellingPriceMinor: 0,
        priceOptions: [],
      }),
    ).toThrow("at least one");
    expect(() =>
      validateMenuPricing({
        pricingMode: "options",
        sellingPriceMinor: 0,
        priceOptions: [
          { name: "Large", priceMinor: 11000 },
          { name: " large ", priceMinor: 12500 },
        ],
      }),
    ).toThrow("unique");
    expect(() =>
      validateMenuPricing({
        pricingMode: "options",
        sellingPriceMinor: 0,
        priceOptions: [{ name: "Large", priceMinor: -1 }],
      }),
    ).toThrow("Option price");
  });
});

describe("money", () => {
  it("keeps calculations in integer minor units", () => {
    expect(multiplyMoney(money(5000), 2)).toBe(10000);
  });

  it("derives V1 order totals from line snapshots", () => {
    expect(
      calculateOrderTotals([
        { unitPriceMinor: money(5000), quantity: 2 },
        { unitPriceMinor: money(1200), quantity: 1 },
      ]),
    ).toEqual({ subtotalMinor: 11200, totalMinor: 11200 });
  });
});
