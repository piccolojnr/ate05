import { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "@ate05/ui";
import {
  buildRevenueReport,
  revenueRange,
  type RevenuePayment,
  type RevenuePeriod,
} from "@ate05/domain";
import type { ReportsClient } from "../../lib/client-capabilities";
import { formatGhs } from "../../lib/pos-client";
import { PageHeader } from "../../components/page-header";

const methodLabels = {
  cash: "Cash",
  mobile_money: "Mobile money",
  card: "Card",
  other: "Other",
};
function dateLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function RevenueScreen({ client }: { client: ReportsClient }) {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<RevenuePeriod>("month");
  const [custom, setCustom] = useState(() => revenueRange("month", today));
  const [payments, setPayments] = useState<RevenuePayment[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void client
      .listRevenuePayments()
      .then((data) => {
        if (active) setPayments(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load revenue. Please try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  function refresh() {
    setLoading(true);
    setError("");
    setRevision((current) => current + 1);
  }
  const range = period === "custom" ? custom : revenueRange(period, today);
  const result = useMemo(() => {
    try {
      return {
        report: buildRevenueReport(payments, {
          start: range.start,
          end: range.end,
        }),
        error: "",
      };
    } catch (cause) {
      return {
        report: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to calculate revenue.",
      };
    }
  }, [payments, range.start, range.end]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue report"
        description="See money received from orders, by day and payment method."
      />
      <section
        className="rounded-xl border bg-card p-5"
        aria-label="Revenue filters"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="w-44 text-sm font-medium">
            Period
            <Select
              className="mt-1.5"
              aria-label="Report period"
              value={period}
              onChange={(event) => {
                const next = event.target.value as RevenuePeriod;
                if (next === "custom") setCustom(range);
                setPeriod(next);
              }}
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
                  className="mt-1.5"
                  aria-label="Report start date"
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
                  className="mt-1.5"
                  aria-label="Report end date"
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
            className="ml-auto"
            disabled={loading}
            onClick={refresh}
          >
            Refresh report
          </Button>
        </div>
        {!result.error && (
          <p
            aria-label="Report date range"
            className="mt-4 text-sm text-muted-foreground"
          >
            {dateLabel(range.start)}
            {range.start !== range.end ? ` – ${dateLabel(range.end)}` : ""}
            {period === "week" ? " · Monday to Sunday" : ""}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Payment dates in Ghana time (UTC). Includes partial payments; excludes
          refunded and voided payments.
        </p>
      </section>
      {loading ? (
        <p
          role="status"
          className="py-12 text-center text-sm text-muted-foreground"
        >
          Loading revenue report…
        </p>
      ) : error || result.error ? (
        <div className="rounded-xl border bg-card p-5">
          <p role="alert" className="text-sm text-destructive">
            {error || result.error}
          </p>
          {error && (
            <Button className="mt-3" variant="secondary" onClick={refresh}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        result.report && (
          <>
            <div
              className="grid gap-4 sm:grid-cols-3"
              aria-label="Revenue summary"
            >
              <Summary
                label="Revenue received"
                value={formatGhs(result.report.totalMinor)}
                testId="revenue-total"
              />
              <Summary
                label="Payments received"
                value={String(result.report.paymentCount)}
              />
              <Summary
                label="Paid orders"
                value={String(result.report.paidOrderCount)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Paid orders counts fully paid orders with a payment in this
              period, once per order. Revenue reflects payment amounts after any
              order discounts, excluding cash change.
            </p>
            {!result.report.paymentCount ? (
              <div className="rounded-xl border bg-card p-12 text-center">
                <p className="font-medium">No payments in this period</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose another period or record a payment from an order.
                </p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <Breakdown
                  title="By payment method"
                  firstColumn="Payment method"
                  rows={result.report.methods.map((row) => ({
                    key: row.method,
                    label: methodLabels[row.method],
                    amount: row.totalMinor,
                    count: row.count,
                  }))}
                />
                <Breakdown
                  title="By day"
                  firstColumn="Date"
                  rows={result.report.days.map((row) => ({
                    key: row.date,
                    label: dateLabel(row.date),
                    amount: row.totalMinor,
                    count: row.count,
                  }))}
                />
              </div>
            )}
            {result.report.estimatedDates && (
              <p role="status" className="text-xs text-muted-foreground">
                Some older browser preview payments use receipt dates because
                their payment dates were not saved. Earlier partial payments may
                be missing from preview data.
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
function Summary({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <p
        data-testid={testId}
        className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums"
      >
        {value}
      </p>
    </div>
  );
}
function Breakdown({
  title,
  firstColumn,
  rows,
}: {
  title: string;
  firstColumn: string;
  rows: Array<{ key: string; label: string; amount: number; count: number }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b px-5 py-4 font-medium">{title}</h2>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Revenue {title.toLowerCase()}</caption>
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              {firstColumn}
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Payments
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="px-5 py-4 font-medium">
                {row.label}
              </th>
              <td className="px-5 py-4 text-right text-muted-foreground tabular-nums">
                {row.count}
              </td>
              <td className="px-5 py-4 text-right font-medium tabular-nums">
                {formatGhs(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
