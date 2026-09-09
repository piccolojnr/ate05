/** Monetary values are integer minor units (pesewas for GHS), never floats. */
export type Money = number & { readonly __brand: "Money" };

export function money(minorUnits: number): Money {
  if (!Number.isSafeInteger(minorUnits))
    throw new Error("Money must be a safe integer of minor units.");
  return minorUnits as Money;
}

export function multiplyMoney(unitPrice: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error("Quantity must be a non-negative integer.");
  return money(unitPrice * quantity);
}
