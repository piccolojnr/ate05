export type EntityId = string;
export type IsoTimestamp = string;

export const userRoles = [
  "owner",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
  "inventory",
] as const;
export type UserRole = (typeof userRoles)[number];
