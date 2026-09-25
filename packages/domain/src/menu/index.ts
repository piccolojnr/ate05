export interface MenuAvailability {
  available: boolean;
  active: boolean;
}

export const pricingModes = ["fixed", "options"] as const;
export type PricingMode = (typeof pricingModes)[number];

export interface MenuPriceOption {
  id: string;
  name: string;
  priceMinor: number;
  sortOrder: number;
  active: boolean;
}

export interface MenuPriceOptionInput {
  id?: string;
  name: string;
  priceMinor: number;
}

export function normalizePriceOptionName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function validateMenuPricing(input: {
  pricingMode: PricingMode;
  sellingPriceMinor: number;
  priceOptions: MenuPriceOptionInput[];
}): void {
  if (!pricingModes.includes(input.pricingMode))
    throw new Error("Choose a valid pricing mode.");
  if (
    !Number.isSafeInteger(input.sellingPriceMinor) ||
    input.sellingPriceMinor < 0
  )
    throw new Error("Price must be a valid non-negative amount.");
  if (input.pricingMode === "fixed") return;
  if (input.priceOptions.length === 0)
    throw new Error("Add at least one price option.");
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const option of input.priceOptions) {
    const normalizedName = normalizePriceOptionName(option.name);
    if (!normalizedName) throw new Error("Option name is required.");
    if (names.has(normalizedName))
      throw new Error("Option names must be unique for this item.");
    names.add(normalizedName);
    if (option.id) {
      if (ids.has(option.id))
        throw new Error("Price option IDs must be unique.");
      ids.add(option.id);
    }
    if (!Number.isSafeInteger(option.priceMinor) || option.priceMinor < 0)
      throw new Error("Option price must be a valid non-negative amount.");
  }
}
