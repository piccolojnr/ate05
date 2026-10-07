export const expenseCategories = [
  "Ingredients",
  "Utilities",
  "Transport",
  "Wages",
  "Maintenance",
  "Rent",
  "Other",
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];
export const expensePaymentMethods = [
  "cash",
  "mobile_money",
  "bank_transfer",
  "card",
  "other",
] as const;
export type ExpensePaymentMethod = (typeof expensePaymentMethods)[number];
export const expensePaymentLabels: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export interface ExpenseInput {
  amountMinor: number;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  paymentMethod: ExpensePaymentMethod;
}
export interface Expense extends ExpenseInput {
  id: string;
  businessId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export type CreateExpenseInput = ExpenseInput & { id: string };
export type UpdateExpenseInput = ExpenseInput & { id: string; version: number };

/** Parse decimal GHS without rounding away invalid fractional pesewas. */
export function parseExpenseAmount(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed))
    throw new Error("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0)
    throw new Error("Enter a positive amount within the supported range.");
  return minor;
}

export function validateExpenseInput(input: ExpenseInput): ExpenseInput {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
    throw new Error(
      "Expense amount must be a positive whole number of pesewas.",
    );
  const date = new Date(`${input.expenseDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.expenseDate
  )
    throw new Error("Choose a valid expense date.");
  if (!expenseCategories.includes(input.category))
    throw new Error("Choose an expense category.");
  if (!expensePaymentMethods.includes(input.paymentMethod))
    throw new Error("Choose a payment method.");
  const description = input.description.trim();
  if (!description || description.length > 240)
    throw new Error("Enter a description between 1 and 240 characters.");
  return {
    amountMinor: input.amountMinor,
    expenseDate: input.expenseDate,
    category: input.category,
    description,
    paymentMethod: input.paymentMethod,
  };
}

export function validateExpenseId(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error("Expense reference is invalid.");
}

export function sameExpenseInput(a: ExpenseInput, b: ExpenseInput): boolean {
  return (
    a.amountMinor === b.amountMinor &&
    a.expenseDate === b.expenseDate &&
    a.category === b.category &&
    a.description === b.description &&
    a.paymentMethod === b.paymentMethod
  );
}
