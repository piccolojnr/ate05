import { Badge, Button, Card, Input } from "@ate05/ui";
import { Icon } from "./icons";
import { StatusBadge } from "./status-badge";
import { formatGhs, type PosOrder } from "../lib/pos-client";

function QuantityControl({
  name,
  quantity,
  onDecrease,
  onIncrease,
}: {
  name: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center rounded-md border bg-muted p-0.5">
      <Button
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label={`Decrease ${name}`}
        onClick={onDecrease}
      >
        <Icon name="minus" width="16" height="16" />
      </Button>
      <span className="min-w-8 text-center tabular-nums text-sm font-bold">
        {quantity}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label={`Increase ${name}`}
        onClick={onIncrease}
      >
        <Icon name="plus" width="16" height="16" />
      </Button>
    </div>
  );
}

function OrderItemRow({
  line,
  onQuantityChange,
  onNoteChange,
}: {
  line: PosOrder["items"][number];
  onQuantityChange: (quantity: number) => void;
  onNoteChange: (notes: string) => void;
}) {
  return (
    <Card className="p-3 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold leading-tight">{line.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatGhs(line.unitPriceMinor)} each
          </p>
        </div>
        <p className="shrink-0 tabular-nums font-black">
          {formatGhs(line.lineTotalMinor)}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <QuantityControl
          name={line.name}
          quantity={line.quantity}
          onDecrease={() => onQuantityChange(line.quantity - 1)}
          onIncrease={() => onQuantityChange(line.quantity + 1)}
        />
        <button
          className="min-h-9 rounded px-2 text-xs font-bold text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          type="button"
          onClick={() => onQuantityChange(0)}
        >
          Remove
        </button>
      </div>
      <Input
        aria-label={`Note for ${line.name}`}
        defaultValue={line.notes ?? ""}
        onBlur={(event) => onNoteChange(event.target.value)}
        className="mt-3 min-h-9 bg-card text-xs"
        placeholder="Add note (e.g. no pepper)"
      />
    </Card>
  );
}

function OrderTotals({ order }: { order: PosOrder | null }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span>
        <span className="tabular-nums">
          {formatGhs(order?.subtotalMinor ?? 0)}
        </span>
      </div>
      <div className="flex justify-between rounded-md bg-muted px-3 py-2.5 text-base font-black">
        <span>Total</span>
        <span className="tabular-nums">
          {formatGhs(order?.totalMinor ?? 0)}
        </span>
      </div>
      {order && order.amountDueMinor > 0 ? (
        <div className="flex justify-between pt-1 font-bold text-primary">
          <span>Amount due</span>
          <span className="tabular-nums">
            {formatGhs(order.amountDueMinor)} due
          </span>
        </div>
      ) : null}
      {order && order.amountPaidMinor > 0 ? (
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Paid</span>
            <span className="tabular-nums">
              {formatGhs(order.amountPaidMinor)}
            </span>
          </div>
          <div className="flex justify-between font-bold text-primary">
            <span>Remaining</span>
            <span className="tabular-nums">
              {formatGhs(order.amountDueMinor)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OrderPanel({
  order,
  onQuantityChange,
  onNoteChange,
  onSendToKitchen,
  sendingToKitchen,
  onReprintTicket,
  onOpenCheckout,
  onCompleteOrder,
}: {
  order: PosOrder | null;
  onQuantityChange: (id: string, quantity: number) => void;
  onNoteChange: (id: string, notes: string) => void;
  onSendToKitchen: () => void;
  sendingToKitchen: boolean;
  onReprintTicket: (ticketId: string) => void;
  onOpenCheckout: () => void;
  onCompleteOrder: () => Promise<void>;
}) {
  const items = order?.items ?? [];
  const pendingPrints =
    order?.kitchenTickets.filter(
      (ticket) => ticket.printStatus !== "printed",
    ) ?? [];
  const kitchenPending = Boolean(order?.kitchenChangesPending);
  return (
    <aside
      className="flex min-h-0 w-[39%] min-w-[360px] max-w-[520px] shrink-0 flex-col overflow-hidden rounded-lg border bg-card shadow-card"
      aria-label="Current order"
    >
      <div className="shrink-0 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Active order
            </p>
            <h2 className="mt-1 truncate text-xl font-black tracking-tight">
              {order
                ? `#${String(order.orderNumber).padStart(4, "0")}`
                : "Draft"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {order
                ? order.orderType === "dine_in"
                  ? (order.tableName ?? "Table not selected")
                  : "TAKEAWAY"
                : "DINE-IN"}
            </p>
          </div>
          {order ? (
            <StatusBadge kind="payment" value={order.paymentStatus} />
          ) : null}
        </div>
        {order ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge kind="order" value={order.status} />
            <Badge
              tone={
                kitchenPending || pendingPrints.length ? "warning" : "success"
              }
            >
              {kitchenPending
                ? "Changes pending"
                : pendingPrints.length
                  ? `${pendingPrints.length} print pending${pendingPrints.length === 1 ? "" : "s"}`
                  : "Kitchen up to date"}
            </Badge>
          </div>
        ) : null}
      </div>

      <div
        aria-label="Order items"
        role="region"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {items.length === 0 ? (
          <div className="grid min-h-40 place-items-center rounded-md border border-dashed bg-muted/30 p-5 text-center">
            <div>
              <p className="font-bold">No items yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an item from the menu to start this order.
              </p>
            </div>
          </div>
        ) : null}
        {items.map((line) => (
          <OrderItemRow
            key={line.id}
            line={line}
            onQuantityChange={(quantity) => onQuantityChange(line.id, quantity)}
            onNoteChange={(notes) => onNoteChange(line.id, notes)}
          />
        ))}
        {order?.receipt ? (
          <div className="rounded-md border bg-success/10 p-3 text-sm">
            <div className="flex items-center justify-between gap-2 font-bold">
              <span>
                PAID · Receipt #
                {String(order.receipt.receiptNumber).padStart(6, "0")}
              </span>
              <Button size="sm" variant="ghost" onClick={onOpenCheckout}>
                View receipt
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paid {formatGhs(order.amountPaidMinor)}
            </p>
            {order.receipt.printStatus !== "printed" ? (
              <p className="mt-1 text-xs text-warning">
                Receipt saved · Print pending
              </p>
            ) : null}
          </div>
        ) : null}

        {order?.kitchenTickets.length ? (
          <details className="rounded-md border bg-muted/30 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Kitchen history</span>
              <span className="font-normal normal-case tracking-normal">
                {order.kitchenTickets.length} ticket
                {order.kitchenTickets.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="mt-2 max-h-24 space-y-2 overflow-y-auto border-t pt-2">
              {order.kitchenTickets.map((ticket) => (
                <div key={ticket.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>
                      Ticket #{ticket.sequence} · {ticket.type.toUpperCase()}
                    </span>
                    <span className="font-normal text-muted-foreground">
                      {ticket.printStatus === "pending"
                        ? "Unprinted"
                        : ticket.printStatus}
                    </span>
                    {ticket.printStatus === "printed" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-[10px]"
                        onClick={() => onReprintTicket(ticket.id)}
                      >
                        Reprint
                      </Button>
                    ) : null}
                  </div>
                  {ticket.items.map((item) => (
                    <p key={item.id} className="text-muted-foreground">
                      {item.action === "cancel" ? "−" : ""}
                      {item.quantity} {item.itemName}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="shrink-0 space-y-3 border-t p-4">
        <OrderTotals order={order} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={kitchenPending ? "secondary" : "ghost"}
            className="w-full"
            disabled={
              !order ||
              !order.items.length ||
              !kitchenPending ||
              sendingToKitchen
            }
            onClick={onSendToKitchen}
          >
            {sendingToKitchen
              ? "Sending…"
              : kitchenPending
                ? "Send to Kitchen"
                : "Kitchen Up to Date"}
          </Button>
          <Button
            className="w-full"
            disabled={!order || (order.amountDueMinor <= 0 && !order.receipt)}
            onClick={onOpenCheckout}
          >
            {order?.paymentStatus === "paid" ? "View receipt" : "Take Payment"}
            {order?.paymentStatus !== "paid" ? (
              <Icon name="arrow" width="17" height="17" />
            ) : null}
          </Button>
        </div>
        {order &&
        order.orderType === "dine_in" &&
        ["open", "sent_to_kitchen", "preparing", "ready"].includes(
          order.status,
        ) ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void onCompleteOrder()}
          >
            Complete Order · Release Table
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
