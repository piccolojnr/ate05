export const stockMovementTypes = [
  "purchase",
  "kitchen_issue",
  "waste",
  "adjustment",
  "return",
] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];
