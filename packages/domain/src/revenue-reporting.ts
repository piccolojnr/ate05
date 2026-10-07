export type RevenuePeriod = "today" | "week" | "month" | "custom";
export interface RevenueRange {
  start: string;
  end: string;
}
export interface RevenuePayment {
  id: string;
  orderId: string;
  amountMinor: number;
  method: "cash" | "mobile_money" | "card" | "other";
  status: "recorded" | "refunded" | "voided";
  receivedAt: string;
  orderPaid: boolean;
  estimatedDate?: boolean;
}
export interface RevenueReport {
  totalMinor: number;
  paymentCount: number;
  paidOrderCount: number;
  estimatedDates: boolean;
  methods: Array<{
    method: RevenuePayment["method"];
    totalMinor: number;
    count: number;
  }>;
  days: Array<{ date: string; totalMinor: number; count: number }>;
}
function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose valid start and end dates.");
  return date;
}
export function revenueRange(
  period: Exclude<RevenuePeriod, "custom">,
  today: string,
): RevenueRange {
  const start = calendarDate(today),
    end = calendarDate(today);
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime() + 6 * 86400000);
  } else if (period === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
/** Ghana uses UTC year round. Require an offset so a local timestamp cannot shift totals silently. */
export function revenueDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      timestamp,
    ) ||
    Number.isNaN(date.getTime())
  )
    throw new Error(
      "A payment has an invalid date. Review payment records before generating this report.",
    );
  try {
    calendarDate(timestamp.slice(0, 10));
  } catch {
    throw new Error(
      "A payment has an invalid date. Review payment records before generating this report.",
    );
  }
  return date.toISOString().slice(0, 10);
}
export function buildRevenueReport(
  payments: readonly RevenuePayment[],
  range: RevenueRange,
): RevenueReport {
  calendarDate(range.start);
  calendarDate(range.end);
  if (range.start > range.end)
    throw new Error("Start date must be on or before end date.");
  const methods = new Map<
    RevenuePayment["method"],
    { method: RevenuePayment["method"]; totalMinor: number; count: number }
  >();
  const days = new Map<
    string,
    { date: string; totalMinor: number; count: number }
  >();
  const paidOrders = new Set<string>(),
    seen = new Set<string>();
  let totalMinor = 0,
    paymentCount = 0,
    estimatedDates = false;
  for (const payment of payments) {
    if (payment.status === "refunded" || payment.status === "voided") continue;
    if (payment.status !== "recorded")
      throw new Error("A payment has an invalid status.");
    const date = revenueDate(payment.receivedAt);
    if (date < range.start || date > range.end) continue;
    if (seen.has(payment.id))
      throw new Error(
        "Duplicate payment records were found. Refresh the report.",
      );
    seen.add(payment.id);
    if (
      !payment.id ||
      !payment.orderId ||
      !Number.isSafeInteger(payment.amountMinor) ||
      payment.amountMinor <= 0 ||
      !["cash", "mobile_money", "card", "other"].includes(payment.method)
    )
      throw new Error(
        "A payment contains invalid data. Review payment records before generating this report.",
      );
    totalMinor += payment.amountMinor;
    if (!Number.isSafeInteger(totalMinor))
      throw new Error(
        "The report total exceeds the supported amount. Choose a shorter date range.",
      );
    paymentCount++;
    if (payment.orderPaid) paidOrders.add(payment.orderId);
    estimatedDates ||= payment.estimatedDate === true;
    const method = methods.get(payment.method) ?? {
      method: payment.method,
      totalMinor: 0,
      count: 0,
    };
    method.totalMinor += payment.amountMinor;
    method.count++;
    methods.set(payment.method, method);
    const day = days.get(date) ?? { date, totalMinor: 0, count: 0 };
    day.totalMinor += payment.amountMinor;
    day.count++;
    days.set(date, day);
  }
  return {
    totalMinor,
    paymentCount,
    paidOrderCount: paidOrders.size,
    estimatedDates,
    methods: [...methods.values()].sort(
      (a, b) => b.totalMinor - a.totalMinor || a.method.localeCompare(b.method),
    ),
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
