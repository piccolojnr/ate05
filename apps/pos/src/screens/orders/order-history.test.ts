import { expect, it } from "vitest";
import {
  groupOrdersByDay,
  orderDate,
  orderWeek,
  ordersInRange,
} from "./order-history";
it("uses Monday to Sunday across month/year boundaries and supports previous weeks", () => {
  expect(orderWeek("2026-10-04")).toEqual({
    start: "2026-09-28",
    end: "2026-10-04",
  });
  expect(orderWeek("2026-10-05", -1)).toEqual({
    start: "2026-09-28",
    end: "2026-10-04",
  });
  expect(orderWeek("2027-01-01")).toEqual({
    start: "2026-12-28",
    end: "2027-01-03",
  });
});
it("uses inclusive Ghana date boundaries and rejects impossible/reversed ranges", () => {
  const orders = [
    { openedAt: "2026-09-28T00:00:00Z" },
    { openedAt: "2026-10-04T23:59:59Z" },
    { openedAt: "2026-10-05T00:00:00Z" },
    { openedAt: "unknown" },
  ];
  expect(ordersInRange(orders, orderWeek("2026-10-04"))).toEqual(
    orders.slice(0, 2),
  );
  expect(ordersInRange(orders, null)).toEqual(orders);
  expect(orderDate("2026-10-05T01:00:00+02:00")).toBe("2026-10-04");
  expect(() =>
    ordersInRange(orders, { start: "2026-02-30", end: "2026-03-01" }),
  ).toThrow("valid");
  expect(() =>
    ordersInRange(orders, { start: "2026-10-05", end: "2026-10-04" }),
  ).toThrow("on or before");
});
it("groups newest days/times first, breaks ties by order number and retains unknown dates last", () => {
  const orders = [
    { orderNumber: 1, openedAt: "2026-10-01T08:00:00Z" },
    { orderNumber: 2, openedAt: "2026-10-02T08:00:00Z" },
    { orderNumber: 3, openedAt: "2026-10-02T08:00:00Z" },
    { orderNumber: 4, openedAt: "unknown" },
  ];
  const groups = groupOrdersByDay(orders);
  expect(groups.map((group) => group.date)).toEqual([
    "2026-10-02",
    "2026-10-01",
    null,
  ]);
  expect(groups[0]!.orders.map((order) => order.orderNumber)).toEqual([3, 2]);
  expect(orders.map((order) => order.orderNumber)).toEqual([1, 2, 3, 4]);
});
