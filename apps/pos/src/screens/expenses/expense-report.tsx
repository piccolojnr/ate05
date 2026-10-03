import { useMemo, useState } from "react";
import { Button, Input, Select } from "@ate05/ui";
import {
  buildExpenseReport,
  expenseReportRange,
  type Expense,
  type ExpenseReportPeriod,
} from "@ate05/domain";
import { formatGhs } from "../../lib/pos-client";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ExpenseReportView({
  expenses,
  active,
  today,
  loading,
  error,
  onRefresh,
}: {
  expenses: Expense[];
  active: boolean;
  today: string;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<ExpenseReportPeriod>("month");
  const [custom, setCustom] = useState(() =>
    expenseReportRange("month", today),
  );
  const range = useMemo(
    () => (period === "custom" ? custom : expenseReportRange(period, today)),
    [period, custom, today],
  );
  const result = useMemo(() => {
    try {
      return { report: buildExpenseReport(expenses, range), error: "" };
    } catch (cause) {
      return {
        report: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to calculate this report.",
      };
    }
  }, [expenses, range]);

  function changePeriod(next: ExpenseReportPeriod) {
    if (next === "custom") setCustom(range);
    setPeriod(next);
  }

  if (!active) return null;

  return (
    <section aria-label="Expense report" className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="w-44 text-sm font-medium">
            Period
            <Select
              aria-label="Report period"
              className="mt-1.5"
              value={period}
              onChange={(event) =>
                changePeriod(event.target.value as ExpenseReportPeriod)
              }
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom dates</option>
            </Select>
          </label>
          {period === "custom" && (
            <>
              <label className="w-44 text-sm font-medium">
                Start date
                <Input
                  aria-label="Report start date"
                  className="mt-1.5"
                  type="date"
                  value={custom.start}
                  onChange={(event) =>
                    setCustom((current) => ({
                      ...current,
                      start: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="w-44 text-sm font-medium">
                End date
                <Input
                  aria-label="Report end date"
                  className="mt-1.5"
                  type="date"
                  value={custom.end}
                  onChange={(event) =>
                    setCustom((current) => ({
                      ...current,
                      end: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          )}
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => void onRefresh()}
            className="ml-auto"
          >
            Refresh report
          </Button>
        </div>
        {!result.error && (
          <p
            className="mt-4 text-sm text-muted-foreground"
            aria-label="Report date range"
          >
            {range.start === range.end
              ? formatDate(range.start)
              : `${formatDate(range.start)} – ${formatDate(range.end)}`}
            {period === "week" ? " · Monday to Sunday" : ""}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Based on the date each expense was incurred.
        </p>
      </div>

      {loading ? (
        <p
          role="status"
          className="py-12 text-center text-sm text-muted-foreground"
        >
          Loading expense report…
        </p>
      ) : error ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => void onRefresh()}
          >
            Try again
          </Button>
        </div>
      ) : result.error ? (
        <p
          role="alert"
          className="rounded-xl border bg-card p-5 text-sm text-destructive"
        >
          {result.error}
        </p>
      ) : (
        result.report && (
          <>
            <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div
                className="rounded-xl border bg-card p-6"
                aria-label="Expense summary"
              >
                <h3 className="text-sm font-medium text-muted-foreground">
                  Total expenses
                </h3>
                <p
                  className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums"
                  data-testid="expense-report-total"
                >
                  {formatGhs(result.report.totalMinor)}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {result.report.count}{" "}
                  {result.report.count === 1 ? "expense" : "expenses"} recorded
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card">
                <h3 className="border-b px-5 py-4 font-medium">
                  Spending by category
                </h3>
                {!result.report.count ? (
                  <div className="px-5 py-12 text-center">
                    <p className="font-medium">No expenses in this period</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Choose another period or add an expense from Records.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Expense category totals for the selected period
                    </caption>
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Category
                        </th>
                        <th
                          scope="col"
                          className="px-5 py-3 text-right font-medium"
                        >
                          Expenses
                        </th>
                        <th
                          scope="col"
                          className="px-5 py-3 text-right font-medium"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.report.categories.map((bucket) => (
                        <tr key={bucket.category}>
                          <th scope="row" className="px-5 py-4 font-medium">
                            {bucket.category}
                            <div
                              aria-hidden="true"
                              className="mt-2 h-1 max-w-36 overflow-hidden rounded-full bg-muted"
                            >
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{
                                  width: `${(bucket.totalMinor / result.report!.totalMinor) * 100}%`,
                                }}
                              />
                            </div>
                          </th>
                          <td className="px-5 py-4 text-right text-muted-foreground tabular-nums">
                            {bucket.count}
                          </td>
                          <td className="px-5 py-4 text-right font-medium tabular-nums">
                            {formatGhs(bucket.totalMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recorded expenses only. Unrecorded spending is not included.
            </p>
          </>
        )
      )}
    </section>
  );
}
