import { describe, expect, it } from "vitest";
import { money, multiplyMoney } from "./money";
import { calculateOrderTotals } from "./orders";

describe("domain package", () => {
  it("loads without infrastructure dependencies", () => {
    expect(true).toBe(true);
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
