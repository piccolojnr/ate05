export const paymentMethods = [
  "cash",
  "mobile_money",
  "card",
  "other",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentRecordStatuses = [
  "recorded",
  "refunded",
  "voided",
] as const;
export type PaymentRecordStatus = (typeof paymentRecordStatuses)[number];
