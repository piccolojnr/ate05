export interface OrderDateRange {
  start: string;
  end: string;
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
export function orderDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
export function orderWeek(today: string, offset = 0): OrderDateRange {
  const monday = calendarDate(today);
  monday.setUTCDate(
    monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + offset * 7,
  );
  return {
    start: monday.toISOString().slice(0, 10),
    end: new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10),
  };
}
export function validateOrderRange(range: OrderDateRange): void {
  calendarDate(range.start);
  calendarDate(range.end);
  if (range.start > range.end)
    throw new Error("Start date must be on or before end date.");
}
export function ordersInRange<T extends { openedAt: string }>(
  orders: readonly T[],
  range: OrderDateRange | null,
): T[] {
  if (!range) return [...orders];
  validateOrderRange(range);
  return orders.filter((order) => {
    const date = orderDate(order.openedAt);
    return date !== null && date >= range.start && date <= range.end;
  });
}
export function groupOrdersByDay<
  T extends { openedAt: string; orderNumber: number },
>(orders: readonly T[]): Array<{ date: string | null; orders: T[] }> {
  const sorted = [...orders].sort((a, b) => {
    const aTime = new Date(a.openedAt).getTime(),
      bTime = new Date(b.openedAt).getTime();
    if (Number.isNaN(aTime))
      return Number.isNaN(bTime) ? b.orderNumber - a.orderNumber : 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime || b.orderNumber - a.orderNumber;
  });
  const days = new Map<string | null, T[]>();
  for (const order of sorted) {
    const date = orderDate(order.openedAt),
      bucket = days.get(date) ?? [];
    bucket.push(order);
    days.set(date, bucket);
  }
  return [...days].map(([date, orders]) => ({ date, orders }));
}
export function orderDateLabel(value: string): string {
  return calendarDate(value).toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
