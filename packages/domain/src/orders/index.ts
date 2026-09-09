import { money, multiplyMoney, type Money } from "../money";

export const orderTypes = ["dine_in", "takeaway"] as const;
export type OrderType = (typeof orderTypes)[number];

export const orderStatuses = [
  "open",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const paymentStatuses = [
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export interface OrderTotalLine {
  unitPriceMinor: Money;
  quantity: number;
}

export function calculateLineTotal(line: OrderTotalLine): Money {
  return multiplyMoney(line.unitPriceMinor, line.quantity);
}

/** V1 total policy: total equals the sum of persisted line snapshots. */
export function calculateOrderTotals(lines: OrderTotalLine[]): {
  subtotalMinor: Money;
  totalMinor: Money;
} {
  const subtotalMinor = money(
    lines.reduce((total, line) => total + calculateLineTotal(line), 0),
  );
  return { subtotalMinor, totalMinor: subtotalMinor };
}
