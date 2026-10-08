import {
  expenseCategories,
  type Expense,
  type ExpenseCategory,
} from "./expenses";

export type ExpenseReportPeriod = "today" | "week" | "month" | "custom";
export interface ExpenseDateRange {
  start: string;
  end: string;
}
export interface ExpenseReport {
  totalMinor: number;
  count: number;
  categories: Array<{
    category: ExpenseCategory;
    totalMinor: number;
    count: number;
  }>;
}

function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose valid start and end dates.");
  return date;
}
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar date arithmetic is independent of the machine's timezone and DST. */
export function expenseReportRange(
  period: Exclude<ExpenseReportPeriod, "custom">,
  today: string,
): ExpenseDateRange {
  const date = calendarDate(today);
  if (period === "today") return { start: today, end: today };
  const start = new Date(date);
  const end = new Date(date);
  if (period === "week") {
    start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    // Derive Sunday from Monday so crossing a month/year works correctly.
    end.setTime(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  } else {
    start.setUTCDate(1);
    end.setUTCMonth(date.getUTCMonth() + 1, 0);
  }
  return { start: dateOnly(start), end: dateOnly(end) };
}

export function buildExpenseReport(
  expenses: readonly Expense[],
  range: ExpenseDateRange,
): ExpenseReport {
  calendarDate(range.start);
  calendarDate(range.end);
  if (range.start > range.end)
    throw new Error("Start date must be on or before end date.");
  const buckets = new Map<
    ExpenseCategory,
    { category: ExpenseCategory; totalMinor: number; count: number }
  >();
  let totalMinor = 0;
  let count = 0;
  for (const expense of expenses) {
    if (expense.expenseDate < range.start || expense.expenseDate > range.end)
      continue;
    if (
      !Number.isSafeInteger(expense.amountMinor) ||
      expense.amountMinor <= 0 ||
      !expenseCategories.includes(expense.category)
    )
      throw new Error(
        "An expense contains invalid data. Review expense records before generating this report.",
      );
    totalMinor += expense.amountMinor;
    if (!Number.isSafeInteger(totalMinor))
      throw new Error(
        "The report total exceeds the supported amount. Choose a shorter date range.",
      );
    count++;
    const bucket = buckets.get(expense.category) ?? {
      category: expense.category,
      totalMinor: 0,
      count: 0,
    };
    bucket.totalMinor += expense.amountMinor;
    bucket.count++;
    buckets.set(expense.category, bucket);
  }
  return {
    totalMinor,
    count,
    categories: [...buckets.values()].sort(
      (a, b) =>
        b.totalMinor - a.totalMinor || a.category.localeCompare(b.category),
    ),
  };
}
