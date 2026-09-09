import { useState } from "react";
import { Badge, Button, Card } from "@ate05/ui";
import {
  formatGhs,
  type OpenOrder,
  type RestaurantTable,
  type PosPrinterConfig,
} from "../lib/pos-client";

function ScreenHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-primary">ATE05 Operations</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <Button>{action}</Button> : null}
    </header>
  );
}

export function OrdersScreen({
  orders,
  onOpenOrder,
}: {
  orders: OpenOrder[];
  onOpenOrder: (order: OpenOrder) => void;
}) {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Orders"
        description="Track open and completed orders across the restaurant."
        action="New order"
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Order</span>
          <span>Guest</span>
          <span>Status</span>
          <span className="text-right">Total</span>
        </div>
        {orders.map((order) => (
          <button
            type="button"
            key={order.id}
            className="grid w-full grid-cols-[1fr_1.5fr_1fr_1fr] gap-4 border-b px-5 py-4 text-left transition-colors last:border-0 hover:bg-muted/40"
            onClick={() => onOpenOrder(order)}
          >
            <span className="font-black">
              #{String(order.orderNumber).padStart(4, "0")}
            </span>
            <span className="text-sm text-muted-foreground">
              {order.tableName ?? "Takeaway"}
            </span>
            <span>
              <Badge tone="primary">{order.status}</Badge>
            </span>
            <span className="text-right font-bold">
              {formatGhs(order.totalMinor)}
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}

export function TablesScreen({ tables }: { tables: RestaurantTable[] }) {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Tables"
        description="A visual snapshot of today’s seating."
        action="Add table"
      />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {tables.map((table) => (
          <Card key={table.name} className="p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border-4 border-muted text-sm font-black">
                {table.name.replace("Table ", "T")}
              </span>
              <Badge
                tone={
                  table.status === "available"
                    ? "success"
                    : table.status === "reserved"
                      ? "warning"
                      : "destructive"
                }
              >
                {table.status}
              </Badge>
            </div>
            <p className="mt-6 text-sm font-bold">
              {table.status === "occupied"
                ? "Order in progress"
                : table.status === "reserved"
                  ? "Reserved"
                  : "Ready for guests"}
            </p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-success" />
          Available
        </span>
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-destructive" />
          Occupied
        </span>
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-warning" />
          Reserved
        </span>
      </div>
    </div>
  );
}

export function MenuScreen() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Menu"
        description="Menu categories and currently available items."
        action="Add item"
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="p-3">
          <p className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Categories
          </p>
          {["Popular", "Grills", "Rice", "Drinks", "Sides", "Dessert"].map(
            (name, index) => (
              <button
                className={`flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm font-semibold ${index === 0 ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                type="button"
                key={name}
              >
                {name}
                <span className="text-xs text-muted-foreground">
                  {index + 2}
                </span>
              </button>
            ),
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_100px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>Item</span>
            <span>Category</span>
            <span className="text-right">Price</span>
          </div>
          {["Jollof Rice", "Waakye Bowl", "Grilled Chicken", "Coke"].map(
            (item, index) => (
              <div
                className="grid grid-cols-[1.5fr_1fr_100px] gap-4 border-b px-5 py-4 last:border-0"
                key={item}
              >
                <span className="font-bold">
                  {item}
                  <Badge className="ml-2" tone="success">
                    Available
                  </Badge>
                </span>
                <span className="text-sm text-muted-foreground">
                  {index < 2 ? "Rice" : index === 2 ? "Grills" : "Drinks"}
                </span>
                <span className="text-right font-bold">
                  GHS {[42, 38, 55, 12][index]}
                </span>
              </div>
            ),
          )}
        </Card>
      </div>
    </div>
  );
}

export function InventoryScreen() {
  const stock = [
    ["Chicken", "18 kg", "warning"],
    ["Rice", "42 kg", "success"],
    ["Cooking Oil", "5 L", "warning"],
    ["Coke", "64 bottles", "success"],
    ["Takeaway Packs", "12 packs", "destructive"],
  ] as const;
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Inventory"
        description="Simple stock overview for the current location."
        action="Add stock item"
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_130px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Item</span>
          <span>On hand</span>
          <span>Status</span>
        </div>
        {stock.map(([name, amount, state]) => (
          <div
            className="grid grid-cols-[1fr_1fr_130px] gap-4 border-b px-5 py-4 last:border-0"
            key={name}
          >
            <span className="font-bold">{name}</span>
            <span className="text-muted-foreground">{amount}</span>
            <Badge
              tone={
                state === "success"
                  ? "success"
                  : state === "warning"
                    ? "warning"
                    : "destructive"
              }
            >
              {state === "success"
                ? "In stock"
                : state === "warning"
                  ? "Low stock"
                  : "Reorder"}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function SettingsScreen({
  printers,
  onSavePrinter,
  onTestPrinter,
  onRetryPrints,
}: {
  printers: PosPrinterConfig[];
  onSavePrinter: (input: {
    id?: string;
    name: string;
    connectionType: "network" | "usb";
    address: string;
    port: number | null;
    paperWidth: 58 | 80;
    cutterEnabled: boolean;
    active: boolean;
  }) => Promise<void>;
  onTestPrinter: (printerId: string) => Promise<void>;
  onRetryPrints: () => Promise<void>;
}) {
  const kitchenPrinter = printers.find((printer) => printer.role === "kitchen");
  const [name, setName] = useState(kitchenPrinter?.name ?? "Kitchen printer");
  const [address, setAddress] = useState(
    kitchenPrinter?.address ?? "192.168.1.100",
  );
  const [port, setPort] = useState(String(kitchenPrinter?.port ?? 9100));
  const [paperWidth, setPaperWidth] = useState<58 | 80>(
    kitchenPrinter?.paperWidth ?? 80,
  );
  const [cutterEnabled, setCutterEnabled] = useState(
    kitchenPrinter?.cutterEnabled ?? true,
  );
  const [active, setActive] = useState(kitchenPrinter?.active ?? true);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    try {
      await onSavePrinter({
        id: kitchenPrinter?.id,
        name,
        connectionType: "network",
        address,
        port: Number(port),
        paperWidth,
        cutterEnabled,
        active,
      });
      setMessage("Kitchen printer saved.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to save printer.",
      );
    }
  }
  async function test() {
    if (!kitchenPrinter) return;
    try {
      await onTestPrinter(kitchenPrinter.id);
      setMessage("Printer connection successful.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Printer test failed.",
      );
    }
  }
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Settings"
        description="Restaurant setup and operational preferences."
      />
      <Card className="max-w-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-black">Kitchen printer</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Network ESC/POS printer. USB and receipt printing are deferred.
            </p>
          </div>
          <Badge tone={kitchenPrinter?.active ? "success" : "neutral"}>
            {kitchenPrinter
              ? kitchenPrinter.active
                ? "Active"
                : "Disabled"
              : "Not configured"}
          </Badge>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Printer name
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-normal"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            IP address / hostname
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-normal"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Raw TCP port
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-normal"
              type="number"
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Paper width
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-normal"
              value={paperWidth}
              onChange={(event) =>
                setPaperWidth(Number(event.target.value) as 58 | 80)
              }
            >
              <option value={80}>80mm</option>
              <option value={58}>58mm</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cutterEnabled}
              onChange={(event) => setCutterEnabled(event.target.checked)}
            />{" "}
            Enable paper cutter
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />{" "}
            Active
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => void save()}>Save printer</Button>
          <Button
            variant="secondary"
            disabled={!kitchenPrinter}
            onClick={() => void test()}
          >
            Test Print
          </Button>
          <Button variant="secondary" onClick={() => void onRetryPrints()}>
            Retry pending prints
          </Button>
        </div>
        {message ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
