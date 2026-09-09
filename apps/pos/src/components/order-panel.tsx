import { Badge, Button, Card } from "@ate05/ui";
import { Icon } from "./icons";
import { Input } from "./ui/input";
import { formatGhs, type PosOrder } from "../lib/pos-client";

export function OrderPanel({
  order,
  onQuantityChange,
  onNoteChange,
  onSendToKitchen,
  sendingToKitchen,
}: {
  order: PosOrder | null;
  onQuantityChange: (id: string, quantity: number) => void;
  onNoteChange: (id: string, notes: string) => void;
  onSendToKitchen: () => void;
  sendingToKitchen: boolean;
}) {
  const items = order?.items ?? [];
  return (
    <aside
      className="flex min-h-0 w-[380px] shrink-0 flex-col rounded-lg border bg-card shadow-card max-xl:w-[340px] max-lg:hidden"
      aria-label="Current order"
    >
      <div className="border-b p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current order
            </p>
            <h2 className="mt-1 text-lg font-black">
              {order
                ? `#${String(order.orderNumber).padStart(4, "0")}`
                : "Draft"}
            </h2>
          </div>
          <Button size="icon" variant="ghost" aria-label="More order options">
            <Icon name="more" />
          </Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Badge tone="primary">
            {order?.orderType === "dine_in" ? "Dine in" : "Takeaway"}
          </Badge>
          {order?.tableName ? <Badge>{order.tableName}</Badge> : null}
          {order ? (
            <Badge tone={order.kitchenChangesPending ? "warning" : "success"}>
              Kitchen:{" "}
              {order.kitchenChangesPending ? "Changes pending" : "Sent"}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Choose an item to start an order.
          </p>
        ) : null}
        {items.map((line) => (
          <Card key={line.id} className="p-3 shadow-none">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-bold">{line.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatGhs(line.unitPriceMinor)} each
                </p>
              </div>
              <p className="font-bold">{formatGhs(line.lineTotalMinor)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-8 px-2"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => onQuantityChange(line.id, line.quantity - 1)}
                >
                  <Icon name="minus" width="16" height="16" />
                </Button>
                <span className="min-w-7 text-center text-sm font-bold">
                  {line.quantity}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-8 px-2"
                  aria-label={`Increase ${line.name}`}
                  onClick={() => onQuantityChange(line.id, line.quantity + 1)}
                >
                  <Icon name="plus" width="16" height="16" />
                </Button>
              </div>
              <button
                className="text-xs font-bold text-destructive hover:underline"
                type="button"
                onClick={() => onQuantityChange(line.id, 0)}
              >
                Remove
              </button>
            </div>
            <Input
              aria-label={`Note for ${line.name}`}
              defaultValue={line.notes ?? ""}
              onBlur={(event) => onNoteChange(line.id, event.target.value)}
              className="mt-3 h-8 bg-card text-xs"
              placeholder="Add note (e.g. no pepper)"
            />
          </Card>
        ))}
      </div>
      <div className="border-t p-5">
        {order?.kitchenTickets.length ? (
          <div className="mb-4 rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Kitchen ticket history
              </p>
              <span className="text-xs text-muted-foreground">
                {order.kitchenTickets.length} ticket
                {order.kitchenTickets.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="max-h-32 space-y-2 overflow-y-auto">
              {order.kitchenTickets.map((ticket) => (
                <div key={ticket.id} className="text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span>
                      Ticket #{ticket.sequence} · {ticket.type.toUpperCase()}
                    </span>
                    <span className="font-normal text-muted-foreground">
                      {ticket.printStatus === "pending"
                        ? "Unprinted"
                        : ticket.printStatus}
                    </span>
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
          </div>
        ) : null}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatGhs(order?.subtotalMinor ?? 0)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Tax</span>
            <span>GHS 0.00</span>
          </div>
          <div className="flex justify-between rounded-md bg-muted px-3 py-3 text-lg font-black">
            <span>Total</span>
            <span>{formatGhs(order?.totalMinor ?? 0)}</span>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            className="w-full !bg-primary hover:!bg-primary/90"
            disabled={
              !order ||
              !order.items.length ||
              !order.kitchenChangesPending ||
              sendingToKitchen
            }
            onClick={onSendToKitchen}
          >
            {sendingToKitchen ? "Sending…" : "Send to Kitchen"}
          </Button>
          <Button variant="secondary" className="w-full" disabled>
            Take Payment <Icon name="arrow" width="17" height="17" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
