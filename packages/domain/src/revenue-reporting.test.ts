import { describe, expect, it } from "vitest";
import {
  buildRevenueReport,
  revenueRange,
  revenueDate,
  type RevenuePayment,
} from "./revenue-reporting";
const range = { start: "2026-09-28", end: "2026-10-04" };
function payment(overrides: Partial<RevenuePayment> = {}): RevenuePayment {
  return {
    id: "p1",
    orderId: "o1",
    amountMinor: 2500,
    method: "cash",
    status: "recorded",
    receivedAt: "2026-10-01T12:00:00Z",
    orderPaid: true,
    ...overrides,
  };
}
describe("revenue reporting", () => {
  it("labels calendar periods across month/year boundaries and leap days", () => {
    expect(revenueRange("week", "2026-10-04")).toEqual(range);
    expect(revenueRange("week", "2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
    expect(revenueRange("month", "2024-02-29")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(revenueRange("today", "2026-10-04")).toEqual({
      start: "2026-10-04",
      end: "2026-10-04",
    });
  });
  it("includes partial payments, deduplicates paid orders and totals methods/days independently of creation dates", () => {
    const result = buildRevenueReport(
      [
        payment(),
        payment({ id: "p2", method: "mobile_money" }),
        payment({
          id: "p3",
          orderId: "o2",
          orderPaid: false,
          amountMinor: 1000,
          receivedAt: "2026-10-02T00:00:00Z",
        }),
      ],
      range,
    );
    expect(result).toMatchObject({
      totalMinor: 6000,
      paymentCount: 3,
      paidOrderCount: 1,
    });
    expect(result.methods).toEqual([
      { method: "cash", totalMinor: 3500, count: 2 },
      { method: "mobile_money", totalMinor: 2500, count: 1 },
    ]);
    expect(result.days).toEqual([
      { date: "2026-10-02", totalMinor: 1000, count: 1 },
      { date: "2026-10-01", totalMinor: 5000, count: 2 },
    ]);
  });
  it("includes inclusive boundaries and excludes voids, refunds and payments outside the range", () => {
    expect(
      buildRevenueReport(
        [
          payment({ receivedAt: "2026-09-28T00:00:00Z" }),
          payment({ id: "p2", receivedAt: "2026-10-04T23:59:59.999Z" }),
          payment({ id: "p3", receivedAt: "2026-10-05T00:00:00Z" }),
          payment({ id: "p4", status: "refunded" }),
          payment({ id: "p5", status: "voided" }),
        ],
        range,
      ).totalMinor,
    ).toBe(5000);
    expect(buildRevenueReport([], range)).toMatchObject({
      totalMinor: 0,
      paymentCount: 0,
      paidOrderCount: 0,
      days: [],
      methods: [],
    });
  });
  it("converts offset timestamps to Ghana dates and flags estimated preview dates", () => {
    expect(revenueDate("2026-10-02T01:00:00+02:00")).toBe("2026-10-01");
    expect(
      buildRevenueReport([payment({ estimatedDate: true })], range)
        .estimatedDates,
    ).toBe(true);
    expect(() => revenueDate("2026-10-01T12:00:00")).toThrow("invalid date");
    expect(() => revenueDate("2026-02-30T12:00:00Z")).toThrow("invalid date");
  });
  it("rejects invalid ranges, invalid payments, duplicates and overflowing totals", () => {
    expect(() =>
      buildRevenueReport([], { start: "2026-02-30", end: "2026-03-01" }),
    ).toThrow("valid");
    expect(() =>
      buildRevenueReport([], { start: range.end, end: range.start }),
    ).toThrow("on or before");
    expect(() =>
      buildRevenueReport([payment({ amountMinor: 0 })], range),
    ).toThrow("invalid data");
    expect(() => buildRevenueReport([payment(), payment()], range)).toThrow(
      "Duplicate",
    );
    expect(() =>
      buildRevenueReport(
        [
          payment({ amountMinor: Number.MAX_SAFE_INTEGER }),
          payment({ id: "p2" }),
        ],
        range,
      ),
    ).toThrow("supported amount");
  });
});
