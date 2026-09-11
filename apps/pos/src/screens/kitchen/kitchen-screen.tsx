import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@ate05/ui";
import { Icon } from "../../components/icons";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import type { PosOrder, KitchenTicket } from "../../lib/pos-client";

type KitchenStage = "new" | "preparing" | "ready";
type Urgency = "normal" | "approaching" | "late" | "critical";

const stageForStatus: Record<string, KitchenStage | undefined> = {
  sent_to_kitchen: "new",
  preparing: "preparing",
  ready: "ready",
};

function ageMinutes(createdAt: string, now: number): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

function urgencyForAge(minutes: number): Urgency {
  if (minutes >= 30) return "critical";
  if (minutes >= 20) return "late";
  if (minutes >= 10) return "approaching";
  return "normal";
}

function ageLabel(minutes: number) {
  return minutes < 1 ? "Just now" : `${minutes} min`;
}

function stageLabel(stage: KitchenStage) {
  if (stage === "new") return "New";
  return stage === "preparing" ? "Preparing" : "Ready";
}

function ticketLabel(ticket: KitchenTicket) {
  if (ticket.type === "initial") return "Initial order";
  if (ticket.type === "addition") return "Added items";
  return "Cancellation";
}

function KitchenTicketCard({
  order,
  ticket,
  now,
  working,
  onAdvance,
}: {
  order: PosOrder;
  ticket: KitchenTicket;
  now: number;
  working: boolean;
  onAdvance: () => void;
}) {
  const minutes = ageMinutes(ticket.createdAt, now);
  const urgency = urgencyForAge(minutes);
  const stage = stageForStatus[order.status] ?? "new";
  const next =
    stage === "new"
      ? "Start preparing"
      : stage === "preparing"
        ? "Mark ready"
        : null;
  const urgencyClass = {
    normal: "border-border",
    approaching: "border-warning/60",
    late: "border-warning bg-warning/[0.04]",
    critical: "border-destructive bg-destructive/[0.04]",
  }[urgency];

  return (
    <Card
      className={`flex shrink-0 flex-col gap-3 p-4 shadow-none ${urgencyClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black tracking-tight">
              #{String(order.orderNumber).padStart(4, "0")}
            </p>
            <Badge tone="neutral">Ticket {ticket.sequence}</Badge>
          </div>
          <p className="mt-1 text-sm font-semibold">
            {order.orderType === "dine_in"
              ? (order.tableName ?? "Dine-in")
              : "Takeaway"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-sm font-black">{ageLabel(minutes)}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {urgency === "normal" ? "On time" : urgency}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-y py-2">
        <div className="flex items-center gap-2">
          <StatusBadge kind="kitchen" value={stage} />
          <span className="text-xs text-muted-foreground">
            {ticketLabel(ticket)}
          </span>
        </div>
        {ticket.printStatus !== "printed" ? (
          <span className="text-xs font-semibold text-warning">
            Print pending
          </span>
        ) : null}
      </div>

      <ul
        className="space-y-3"
        aria-label={`Items for order ${order.orderNumber}`}
      >
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="w-8 shrink-0 text-center text-lg font-black tabular-nums">
              {item.action === "cancel" ? `−${item.quantity}` : item.quantity}
            </span>
            <div className="min-w-0">
              <p
                className={
                  item.action === "cancel" ? "line-through" : "font-bold"
                }
              >
                {item.itemName}
              </p>
              {item.action === "cancel" ? (
                <p className="text-xs font-semibold text-destructive">
                  Cancel item
                </p>
              ) : null}
              {item.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  Note: {item.notes}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {next ? (
        <Button
          className="mt-auto min-h-11 w-full"
          onClick={onAdvance}
          disabled={working}
        >
          {working ? "Updating…" : next}
          <Icon name="arrow" width="17" height="17" />
        </Button>
      ) : (
        <div className="mt-auto rounded-md bg-success/10 px-3 py-2.5 text-center text-sm font-bold text-success">
          Ready for handoff
        </div>
      )}
    </Card>
  );
}

export function KitchenScreen({
  orders,
  loading,
  error,
  onRefresh,
  onAdvance,
}: {
  orders: PosOrder[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onAdvance: (orderId: string, status: "preparing" | "ready") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const tickets = useMemo(
    () =>
      orders
        .flatMap((order) =>
          order.kitchenTickets.map((ticket) => ({ order, ticket })),
        )
        .filter(({ order, ticket }) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return [
            order.orderNumber,
            order.tableName,
            order.orderType === "takeaway" ? "takeaway" : "dine in",
            ticket.sequence,
            ...ticket.items.map((item) => item.itemName),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        })
        .sort((a, b) => {
          const created =
            Date.parse(a.ticket.createdAt) - Date.parse(b.ticket.createdAt);
          return (
            created ||
            a.order.orderNumber - b.order.orderNumber ||
            a.ticket.sequence - b.ticket.sequence
          );
        }),
    [orders, query],
  );

  const byStage = (stage: KitchenStage) =>
    tickets.filter(({ order }) => stageForStatus[order.status] === stage);
  const counts = {
    new: byStage("new").length,
    preparing: byStage("preparing").length,
    ready: byStage("ready").length,
  };

  async function advance(order: PosOrder) {
    const stage = stageForStatus[order.status];
    const status =
      stage === "new" ? "preparing" : stage === "preparing" ? "ready" : null;
    if (!status) return;
    setWorkingId(order.id);
    try {
      await onAdvance(order.id, status);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader
        title="Kitchen"
        description="Move durable kitchen tickets from new to ready."
        action={
          <Button
            variant="secondary"
            onClick={() => void onRefresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex min-w-0 items-center gap-1 rounded-md border bg-card p-1"
          aria-label="Kitchen stage counts"
        >
          {(["new", "preparing", "ready"] as KitchenStage[]).map((stage) => (
            <span key={stage} className="px-3 py-1.5 text-sm font-semibold">
              {stageLabel(stage)}{" "}
              <span className="text-muted-foreground">{counts[stage]}</span>
            </span>
          ))}
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search kitchen tickets</span>
          <Icon
            name="search"
            width="17"
            height="17"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search kitchen tickets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-10 pl-9"
            placeholder="Search tickets or tables"
          />
        </label>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onRefresh()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {loading && !orders.length ? (
        <p className="text-sm text-muted-foreground">
          Loading kitchen tickets…
        </p>
      ) : null}
      {!loading && !error && !tickets.length ? (
        <Card className="grid min-h-48 place-items-center border-dashed p-8 text-center shadow-none">
          <div>
            <p className="font-bold">No active kitchen tickets</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tickets sent from POS will appear here.
            </p>
          </div>
        </Card>
      ) : null}
      {tickets.length ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden pb-2 lg:grid-cols-3">
          {(["new", "preparing", "ready"] as KitchenStage[]).map((stage) => {
            const stageTickets = byStage(stage);
            return (
              <section
                key={stage}
                aria-labelledby={`kitchen-${stage}`}
                className="flex min-w-0 min-h-[320px] flex-col rounded-lg border bg-muted/30"
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
                  <div>
                    <h2 id={`kitchen-${stage}`} className="font-black">
                      {stageLabel(stage)}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {stage === "new"
                        ? "Awaiting preparation"
                        : stage === "preparing"
                          ? "In progress"
                          : "Ready for handoff"}
                    </p>
                  </div>
                  <Badge
                    tone={
                      stage === "ready"
                        ? "success"
                        : stage === "preparing"
                          ? "warning"
                          : "primary"
                    }
                  >
                    {stageTickets.length}
                  </Badge>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {stageTickets.length ? (
                    stageTickets.map(({ order, ticket }) => (
                      <KitchenTicketCard
                        key={ticket.id}
                        order={order}
                        ticket={ticket}
                        now={now}
                        working={workingId === order.id}
                        onAdvance={() => void advance(order)}
                      />
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      No tickets here.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { ageMinutes, urgencyForAge };
