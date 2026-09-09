import { useState } from "react";
import { Badge, Button, Card } from "@ate05/ui";
import { notify } from "../lib/notifications";
import { PageHeader } from "../components/page-header";
import { StatusBadge } from "../components/status-badge";
import {
  type InventoryItem,
  type InventoryUnit,
  type StockMovement,
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
    <PageHeader
      title={title}
      description={description}
      action={action ? <Button>{action}</Button> : undefined}
    />
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

export function InventoryScreen({
  items,
  onCreate,
  onReceive,
  onIssue,
  onWaste,
  onReturn,
  onAdjust,
  onHistory,
  onToggleActive,
}: {
  items: InventoryItem[];
  onCreate: (input: {
    name: string;
    unit: InventoryUnit;
    startingQuantity: number;
    reorderThreshold: number | null;
  }) => Promise<void>;
  onReceive: (id: string, quantity: number, reason?: string) => Promise<void>;
  onIssue: (id: string, quantity: number, reason?: string) => Promise<void>;
  onWaste: (id: string, quantity: number, reason: string) => Promise<void>;
  onReturn: (id: string, quantity: number, reason?: string) => Promise<void>;
  onAdjust: (id: string, quantity: number, reason: string) => Promise<void>;
  onHistory: (id: string) => Promise<StockMovement[]>;
  onToggleActive: (item: InventoryItem) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("kg");
  const [startingQuantity, setStartingQuantity] = useState("");
  const [threshold, setThreshold] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<
    "receive" | "issue" | "waste" | "return" | "adjust"
  >("receive");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<StockMovement[]>([]);
  const selected = items.find(
    (item) => item.id === (selectedId ?? items[0]?.id),
  );
  async function create() {
    await onCreate({
      name,
      unit,
      startingQuantity: Number(startingQuantity || 0),
      reorderThreshold: threshold ? Number(threshold) : null,
    });
    setName("");
    setStartingQuantity("");
    setThreshold("");
  }
  async function submitMovement() {
    if (!selected) return;
    const value = Number(quantity);
    if (action === "receive") await onReceive(selected.id, value, reason);
    if (action === "issue") await onIssue(selected.id, value, reason);
    if (action === "waste") await onWaste(selected.id, value, reason);
    if (action === "return") await onReturn(selected.id, value, reason);
    if (action === "adjust") await onAdjust(selected.id, value, reason);
    setQuantity("");
    setReason("");
    setHistory(await onHistory(selected.id));
  }
  async function showHistory(id: string) {
    setSelectedId(id);
    setHistory(await onHistory(id));
  }
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Inventory"
        description="Track stock balances and immutable movement history."
      />
      <Card className="p-5">
        <h2 className="font-black">Create inventory item</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <input
            aria-label="Inventory item name"
            className="rounded-md border bg-background px-3 py-2"
            placeholder="Item name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            aria-label="Inventory unit"
            className="rounded-md border bg-background px-3 py-2"
            value={unit}
            onChange={(event) => setUnit(event.target.value as InventoryUnit)}
          >
            {["kg", "g", "litre", "ml", "bottle", "piece", "pack"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
          <input
            aria-label="Starting quantity"
            className="rounded-md border bg-background px-3 py-2"
            type="number"
            min="0"
            step="1"
            placeholder="Starting quantity"
            value={startingQuantity}
            onChange={(event) => setStartingQuantity(event.target.value)}
          />
          <input
            aria-label="Reorder threshold"
            className="rounded-md border bg-background px-3 py-2"
            type="number"
            min="0"
            step="1"
            placeholder="Reorder threshold"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </div>
        <Button
          className="mt-3"
          disabled={!name.trim()}
          onClick={() => void create()}
        >
          Create item
        </Button>
      </Card>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_130px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Item</span>
          <span>Current</span>
          <span>Reorder at</span>
          <span>Status</span>
        </div>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => void showHistory(item.id)}
            className="grid w-full grid-cols-[1.4fr_1fr_1fr_130px] gap-4 border-b px-5 py-4 text-left last:border-0 hover:bg-muted/40"
          >
            <span className="font-bold">{item.name}</span>
            <span>
              {item.currentQuantity} {item.unit}
            </span>
            <span className="text-muted-foreground">
              {item.reorderThreshold ?? "—"}{" "}
              {item.reorderThreshold === null ? "" : item.unit}
            </span>
            <StatusBadge kind="inventory" value={item.stockState} />
          </button>
        ))}
        {!items.length ? (
          <p className="p-5 text-sm text-muted-foreground">
            No inventory items yet.
          </p>
        ) : null}
      </Card>
      {selected ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-black">
              {selected.name} · {selected.currentQuantity} {selected.unit}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                aria-label="Stock action"
                className="rounded-md border bg-background px-3 py-2"
                value={action}
                onChange={(event) =>
                  setAction(event.target.value as typeof action)
                }
              >
                <option value="receive">Receive stock</option>
                <option value="issue">Issue to kitchen</option>
                <option value="waste">Record waste</option>
                <option value="return">Return stock</option>
                <option value="adjust">Adjust to counted quantity</option>
              </select>
              <input
                aria-label="Movement quantity"
                className="rounded-md border bg-background px-3 py-2"
                type="number"
                min="0"
                step="1"
                placeholder={
                  action === "adjust" ? "Counted quantity" : "Quantity"
                }
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <input
              aria-label="Movement reason"
              className="mt-3 w-full rounded-md border bg-background px-3 py-2"
              placeholder={
                action === "waste" || action === "adjust"
                  ? "Reason (required)"
                  : "Reference or note"
              }
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              className="mt-3"
              disabled={
                !quantity ||
                ((action === "waste" || action === "adjust") && !reason.trim())
              }
              onClick={() => void submitMovement()}
            >
              Save movement
            </Button>
            <Button
              className="ml-2 mt-3"
              variant="secondary"
              onClick={() => void onToggleActive(selected)}
            >
              {selected.active ? "Deactivate item" : "Activate item"}
            </Button>
          </Card>
          <Card className="p-5">
            <h2 className="font-black">Movement history</h2>
            <div className="mt-3 space-y-2 text-sm">
              {history.map((movement) => (
                <div
                  key={movement.id}
                  className="flex justify-between border-b pb-2"
                >
                  <span>
                    {new Date(movement.createdAt).toLocaleString()} ·{" "}
                    {movement.type}
                  </span>
                  <span className="font-bold">
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {movement.quantityDelta} {selected.unit}
                  </span>
                </div>
              ))}
              {!history.length ? (
                <p className="text-muted-foreground">
                  Select the item to load history.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsScreen({
  printers,
  onSavePrinter,
  onTestPrinter,
  onRetryPrints,
  onRetryReceiptPrints,
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
  onRetryReceiptPrints: () => Promise<void>;
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
      notify.success("Kitchen printer saved.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to save printer.",
      );
    }
  }
  async function test() {
    if (!kitchenPrinter) return;
    try {
      await onTestPrinter(kitchenPrinter.id);
      notify.success("Printer connection successful.");
    } catch (cause) {
      notify.error(
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
              Network ESC/POS printer for kitchen tickets.
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
          <Button
            variant="secondary"
            onClick={() => void onRetryReceiptPrints()}
          >
            Retry receipt prints
          </Button>
        </div>
      </Card>
      <ReceiptPrinterSettings
        printer={printers.find((printer) => printer.role === "receipt")}
        onSavePrinter={onSavePrinter}
        onTestPrinter={onTestPrinter}
      />
    </div>
  );
}

function ReceiptPrinterSettings({
  printer,
  onSavePrinter,
  onTestPrinter,
}: {
  printer?: PosPrinterConfig;
  onSavePrinter: (input: {
    id?: string;
    role?: "kitchen" | "receipt";
    name: string;
    connectionType: "network" | "usb";
    address: string;
    port: number | null;
    paperWidth: 58 | 80;
    cutterEnabled: boolean;
    active: boolean;
  }) => Promise<void>;
  onTestPrinter: (printerId: string) => Promise<void>;
}) {
  const [name, setName] = useState(printer?.name ?? "Receipt printer");
  const [address, setAddress] = useState(printer?.address ?? "192.168.1.101");
  const [port, setPort] = useState(String(printer?.port ?? 9100));
  const [paperWidth, setPaperWidth] = useState<58 | 80>(
    printer?.paperWidth ?? 80,
  );
  const [active, setActive] = useState(printer?.active ?? true);
  async function save() {
    try {
      await onSavePrinter({
        id: printer?.id,
        role: "receipt",
        name,
        connectionType: "network",
        address,
        port: Number(port),
        paperWidth,
        cutterEnabled: printer?.cutterEnabled ?? true,
        active,
      });
      notify.success("Receipt printer saved.");
    } catch (cause) {
      notify.error(
        cause instanceof Error
          ? cause.message
          : "Unable to save receipt printer.",
      );
    }
  }
  return (
    <Card className="max-w-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-black">Receipt printer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Used for customer receipts. It may share the kitchen printer.
          </p>
        </div>
        <Badge tone={printer?.active ? "success" : "neutral"}>
          {printer
            ? printer.active
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
      <div className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />{" "}
        Active
      </div>
      <div className="mt-5 flex gap-3">
        <Button onClick={() => void save()}>Save printer</Button>
        <Button
          variant="secondary"
          disabled={!printer}
          onClick={() => printer && void onTestPrinter(printer.id)}
        >
          Test Print
        </Button>
      </div>
    </Card>
  );
}
