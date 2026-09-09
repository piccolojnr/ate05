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
