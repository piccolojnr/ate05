import { describe, expect, it } from "vitest";
import {
  parseExpenseAmount,
  validateExpenseInput,
  type ExpenseInput,
} from "./expenses";

const valid: ExpenseInput = {
  amountMinor: 12345,
  expenseDate: "2026-10-03",
  category: "Ingredients",
  description: "  Fresh vegetables  ",
  paymentMethod: "cash",
};

describe("expense validation", () => {
  it("converts decimal GHS exactly and rejects fractional pesewas", () => {
    expect(parseExpenseAmount("123.45")).toBe(12345);
    expect(parseExpenseAmount("0.29")).toBe(29);
    expect(parseExpenseAmount(" 12.5 ")).toBe(1250);
    for (const amount of [
      "",
      "0",
      "-1",
      "1.001",
      "1e3",
      "Infinity",
      "1,000",
      "9007199254740991",
    ])
      expect(() => parseExpenseAmount(amount)).toThrow();
  });

  it("validates calendar dates and trims descriptions", () => {
    expect(validateExpenseInput(valid).description).toBe("Fresh vegetables");
    expect(
      validateExpenseInput({ ...valid, expenseDate: "2028-02-29" }).expenseDate,
    ).toBe("2028-02-29");
    for (const expenseDate of [
      "",
      "2026-02-29",
      "2026-04-31",
      "03/10/2026",
      "2026-13-01",
    ])
      expect(() => validateExpenseInput({ ...valid, expenseDate })).toThrow(
        "valid expense date",
      );
  });

  it("rejects invalid amounts, missing descriptions, and unknown classifications", () => {
    for (const amountMinor of [
      0,
      -1,
      1.1,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => validateExpenseInput({ ...valid, amountMinor })).toThrow();
    for (const description of ["  ", "x".repeat(241)])
      expect(() => validateExpenseInput({ ...valid, description })).toThrow();
    expect(() =>
      validateExpenseInput({
        ...valid,
        category: "Unknown" as ExpenseInput["category"],
      }),
    ).toThrow();
    expect(() =>
      validateExpenseInput({
        ...valid,
        paymentMethod: "Unknown" as ExpenseInput["paymentMethod"],
      }),
    ).toThrow();
  });
});
