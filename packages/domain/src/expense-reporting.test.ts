import { describe, expect, it } from "vitest";
import { buildExpenseReport, expenseReportRange } from "./expense-reporting";
import type { Expense } from "./expenses";

function entry(
  expenseDate: string,
  amountMinor: number,
  category: Expense["category"] = "Ingredients",
): Expense {
  return {
    id: expenseDate,
    businessId: "business",
    createdBy: "owner",
    updatedBy: "owner",
    createdAt: "2026-10-03T12:00:00Z",
    updatedAt: "2026-10-03T12:00:00Z",
    version: 1,
    description: "Expense",
    paymentMethod: "cash",
    expenseDate,
    amountMinor,
    category,
  };
}

describe("expense reporting", () => {
  it("uses Monday–Sunday boundaries, including month and year crossings", () => {
    expect(expenseReportRange("week", "2026-10-03")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
    expect(expenseReportRange("week", "2026-10-04")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
    expect(expenseReportRange("week", "2026-10-05")).toEqual({
      start: "2026-10-05",
      end: "2026-10-11",
    });
    expect(expenseReportRange("week", "2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });
  it("handles today, leap February and December", () => {
    expect(expenseReportRange("today", "2026-10-03")).toEqual({
      start: "2026-10-03",
      end: "2026-10-03",
    });
    expect(expenseReportRange("month", "2028-02-15")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(expenseReportRange("month", "2026-12-31")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });
  it("includes both boundaries, uses expense date rather than entry time, and reconciles categories", () => {
    const report = buildExpenseReport(
      [
        entry("2026-09-30", 900),
        entry("2026-10-01", 29),
        entry("2026-10-15", 71),
        entry("2026-10-31", 500, "Utilities"),
        entry("2026-11-01", 900),
      ],
      { start: "2026-10-01", end: "2026-10-31" },
    );
    expect(report).toEqual({
      totalMinor: 600,
      count: 3,
      categories: [
        { category: "Utilities", totalMinor: 500, count: 1 },
        { category: "Ingredients", totalMinor: 100, count: 2 },
      ],
    });
    expect(
      report.categories.reduce((sum, bucket) => sum + bucket.totalMinor, 0),
    ).toBe(report.totalMinor);
  });
  it("handles empty periods and reflects corrected amounts", () => {
    const range = { start: "2026-10-03", end: "2026-10-03" };
    expect(buildExpenseReport([], range)).toEqual({
      totalMinor: 0,
      count: 0,
      categories: [],
    });
    expect(
      buildExpenseReport(
        [{ ...entry("2026-10-03", 12345), amountMinor: 15000, version: 2 }],
        range,
      ).totalMinor,
    ).toBe(15000);
  });
  it("rejects reversed and invalid ranges, invalid amounts, and aggregate overflow", () => {
    expect(() =>
      buildExpenseReport([], { start: "2026-10-04", end: "2026-10-03" }),
    ).toThrow("Start date");
    expect(() =>
      buildExpenseReport([], { start: "2026-02-30", end: "2026-10-03" }),
    ).toThrow("valid start");
    const range = { start: "2026-10-03", end: "2026-10-03" };
    expect(() => buildExpenseReport([entry(range.start, NaN)], range)).toThrow(
      "invalid data",
    );
    expect(() =>
      buildExpenseReport(
        [entry(range.start, Number.MAX_SAFE_INTEGER), entry(range.start, 1)],
        range,
      ),
    ).toThrow("exceeds");
  });
});
