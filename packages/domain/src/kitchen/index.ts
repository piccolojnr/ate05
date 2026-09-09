export const kitchenTicketTypes = [
  "initial",
  "addition",
  "cancellation",
] as const;
export type KitchenTicketType = (typeof kitchenTicketTypes)[number];

export * from "./deltas";
