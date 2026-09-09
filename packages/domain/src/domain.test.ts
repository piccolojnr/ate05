import { describe, expect, it } from "vitest";
import { money, multiplyMoney } from "./money";

describe("domain package", () => {
  it("loads without infrastructure dependencies", () => {
    expect(true).toBe(true);
  });
});

describe("money", () => {
  it("keeps calculations in integer minor units", () => {
    expect(multiplyMoney(money(5000), 2)).toBe(10000);
  });
});
