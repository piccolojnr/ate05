import { useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@ate05/ui";
import { Icon } from "../../components/icons";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import { formatGhs, type OpenOrder } from "../../lib/pos-client";

type OrderFilter = "all" | "active" | "completed" | "unpaid" | "paid";

function openedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function matchesFilter(order: OpenOrder, filter: OrderFilter) {
  if (filter === "all") return true;
  if (filter === "active") return order.status !== "completed";
  if (filter === "completed") return order.status === "completed";
  if (filter === "unpaid") {
    return (
      order.paymentStatus === "unpaid" ||
      order.paymentStatus === "partially_paid"
    );
  }
  return order.paymentStatus === "paid";
}

function OrderMoneySummary({ order }: { order: OpenOrder }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-right text-xs">
      <div>
        <p className="text-muted-foreground">Total</p>
        <p className="mt-1 tabular-nums font-bold">
          {formatGhs(order.totalMinor)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Paid</p>
        <p className="mt-1 tabular-nums font-bold">
          {formatGhs(order.amountPaidMinor)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Due</p>
        <p
          className={`mt-1 tabular-nums font-black ${order.amountDueMinor > 0 ? "text-primary" : "text-success"}`}
        >
          {formatGhs(order.amountDueMinor)}
        </p>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  selected,
  onSelect,
  onOpen,
}: {
  order: OpenOrder;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={`grid gap-4 border-b p-4 last:border-0 lg:grid-cols-[minmax(190px,1fr)_minmax(150px,0.8fr)_minmax(185px,1.1fr)_auto] lg:items-center ${selected ? "bg-primary/[0.04]" : "hover:bg-muted/30"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-pressed={selected}
      >
        <span className="block text-lg font-black tracking-tight">
          #{String(order.orderNumber).padStart(4, "0")}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {openedLabel(order.openedAt)} ·{" "}
          {order.orderType === "dine_in"
            ? (order.tableName ?? "Table not selected")
            : "TAKEAWAY"}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="order" value={order.status} />
        <StatusBadge kind="payment" value={order.paymentStatus} />
      </div>
      <OrderMoneySummary order={order} />
      <Button size="sm" className="w-full lg:w-auto" onClick={onOpen}>
        Open Order
        <Icon name="arrow" width="16" height="16" />
      </Button>
    </article>
  );
}

export function OrdersScreen({
  orders,
  onOpenOrder,
  onNewOrder,
}: {
  orders: OpenOrder[];
  onOpenOrder: (order: OpenOrder) => void;
  onNewOrder: () => void;
}) {
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!matchesFilter(order, filter)) return false;
        if (!normalizedQuery) return true;
        const receiptNumber = order.receipt?.receiptNumber
          ? String(order.receipt.receiptNumber)
          : "";
        const searchable = [
          String(order.orderNumber),
          order.tableName ?? "",
          order.orderType === "takeaway" ? "takeaway" : "dine in",
          receiptNumber,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      }),
    [filter, normalizedQuery, orders],
  );
  const selectedOrder =
    filteredOrders.find((order) => order.id === selectedId) ??
    filteredOrders[0];
  const activeCount = orders.filter(
    (order) => order.status !== "completed",
  ).length;
  const completedCount = orders.filter(
    (order) => order.status === "completed",
  ).length;
  const dueTotal = orders.reduce(
    (total, order) => total + order.amountDueMinor,
    0,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Find active orders, check their progress, and reopen them quickly."
        action={<Button onClick={onNewOrder}>New Order</Button>}
      />

      <Card className="p-3 shadow-none">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="flex min-w-0 flex-wrap items-center gap-1"
            aria-label="Order filters"
          >
            {(
              [
                ["active", `Active ${activeCount}`],
                ["all", `All ${orders.length}`],
                ["completed", `Completed ${completedCount}`],
                ["unpaid", "Money due"],
                ["paid", "Paid"],
              ] as Array<[OrderFilter, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs sm:block">
              <span className="text-muted-foreground">Outstanding</span>{" "}
              <strong className="tabular-nums text-primary">
                {formatGhs(dueTotal)}
              </strong>
            </div>
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search orders</span>
              <Icon
                name="search"
                width="17"
                height="17"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search orders"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-10 pl-9"
                placeholder="Search orders"
              />
            </label>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Card className="overflow-hidden shadow-none">
          <div className="hidden grid-cols-[minmax(190px,1fr)_minmax(150px,0.8fr)_minmax(185px,1.1fr)_auto] gap-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground lg:grid">
            <span>Order</span>
            <span>Progress</span>
            <span className="text-right">Money</span>
            <span />
          </div>
          {filteredOrders.length ? (
            filteredOrders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                selected={selectedOrder?.id === order.id}
                onSelect={() => setSelectedId(order.id)}
                onOpen={() => onOpenOrder(order)}
              />
            ))
          ) : (
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <p className="font-bold">
                  {query.trim()
                    ? "No orders match your search"
                    : "No orders in this view"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {query.trim()
                    ? "Try an order number, table, takeaway, or receipt number."
                    : filter === "active"
                      ? "Start a new order to see it here."
                      : "Try another filter to see more orders."}
                </p>
                {filter === "active" && !query.trim() ? (
                  <Button size="sm" className="mt-4" onClick={onNewOrder}>
                    Start New Order
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card className="h-fit p-4 shadow-none" aria-label="Order details">
          {selectedOrder ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    Selected order
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">
                    #{String(selectedOrder.orderNumber).padStart(4, "0")}
                  </h2>
                </div>
                <StatusBadge
                  kind="payment"
                  value={selectedOrder.paymentStatus}
                />
              </div>
              <div className="mt-4 space-y-3 border-y py-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Location</span>
                  <strong>
                    {selectedOrder.orderType === "dine_in"
                      ? (selectedOrder.tableName ?? "Table not selected")
                      : "TAKEAWAY"}
                  </strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Opened</span>
                  <strong>{openedLabel(selectedOrder.openedAt)}</strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Progress</span>
                  <StatusBadge kind="order" value={selectedOrder.status} />
                </div>
              </div>
              <OrderMoneySummary order={selectedOrder} />
              {selectedOrder.receipt ? (
                <div className="mt-4 rounded-md bg-success/10 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>
                      Receipt #
                      {String(selectedOrder.receipt.receiptNumber).padStart(
                        6,
                        "0",
                      )}
                    </span>
                    <Badge
                      tone={
                        selectedOrder.receipt.printStatus === "printed"
                          ? "success"
                          : "warning"
                      }
                    >
                      {selectedOrder.receipt.printStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Receipt actions are available after reopening the order.
                  </p>
                </div>
              ) : null}
              <Button
                className="mt-4 w-full"
                onClick={() => onOpenOrder(selectedOrder)}
              >
                Open Order
                <Icon name="arrow" width="16" height="16" />
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="font-bold">Select an order</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an order to inspect its status and balance.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
