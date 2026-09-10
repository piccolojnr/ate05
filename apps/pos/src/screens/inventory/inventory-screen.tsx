import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import type {
  InventoryItem,
  InventoryUnit,
  StockMovement,
} from "../../lib/pos-client";

type InventoryAction = "receive" | "issue" | "waste" | "return" | "adjust";

const units: InventoryUnit[] = [
  "kg",
  "g",
  "litre",
  "ml",
  "bottle",
  "piece",
  "pack",
];

function movementLabel(type: StockMovement["type"]): string {
  return {
    purchase: "Receive",
    kitchen_issue: "Kitchen issue",
    waste: "Waste",
    return: "Return",
    adjustment: "Adjustment",
  }[type];
}

function formatMovementDate(value: string): string {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Quantity({ value, unit }: { value: number; unit: InventoryUnit }) {
  return (
    <span className="tabular-nums">
      {value.toLocaleString()} {unit}
    </span>
  );
}

function InventoryActionDialog({
  item,
  action,
  onClose,
  onSubmit,
}: {
  item: InventoryItem;
  action: InventoryAction;
  onClose: () => void;
  onSubmit: (
    action: InventoryAction,
    quantity: number,
    reason: string,
  ) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdjust = action === "adjust";
  const requiresReason = action === "waste" || isAdjust;
  const labels: Record<InventoryAction, string> = {
    receive: "Receive stock",
    issue: "Issue to kitchen",
    waste: "Record waste",
    return: "Return to inventory",
    adjust: "Adjust counted stock",
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const value = Number(quantity);
    if (!Number.isSafeInteger(value) || (isAdjust ? value < 0 : value <= 0)) {
      setError(
        isAdjust
          ? "Counted quantity must be a non-negative whole number."
          : "Quantity must be a positive whole number.",
      );
      return;
    }
    if (requiresReason && !reason.trim()) {
      setError("A reason is required for this action.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(action, value, reason.trim());
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save movement.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
      <Card
        className="w-full max-w-md p-6 shadow-float"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-action-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Stock action
            </p>
            <h2 id="inventory-action-title" className="mt-1 text-xl font-black">
              {labels[action]}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.name} · Available{" "}
              <Quantity value={item.currentQuantity} unit={item.unit} />
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close stock action"
          >
            Close
          </Button>
        </div>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-semibold">
            {isAdjust ? "Counted quantity" : "Quantity"}
            <Input
              aria-label={isAdjust ? "Counted quantity" : "Movement quantity"}
              className="mt-1"
              type="number"
              min="0"
              step="1"
              autoFocus
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={
                isAdjust ? `System: ${item.currentQuantity}` : `In ${item.unit}`
              }
            />
          </label>
          <label className="block text-sm font-semibold">
            {requiresReason ? "Reason" : "Reference or note"}
            <Input
              aria-label="Movement reason"
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                requiresReason ? "Reason (required)" : "Optional note"
              }
            />
          </label>
          {isAdjust && quantity !== "" ? (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
              Difference:{" "}
              <strong className="tabular-nums">
                {Number(quantity) - item.currentQuantity} {item.unit}
              </strong>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save movement"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function NewInventoryItemDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    unit: InventoryUnit;
    startingQuantity: number;
    reorderThreshold: number | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("kg");
  const [startingQuantity, setStartingQuantity] = useState("");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const starting = Number(startingQuantity || 0);
    const reorder = threshold === "" ? null : Number(threshold);
    if (!name.trim()) return setError("Inventory item name is required.");
    if (!Number.isSafeInteger(starting) || starting < 0)
      return setError("Starting quantity must be a non-negative whole number.");
    if (reorder !== null && (!Number.isSafeInteger(reorder) || reorder < 0))
      return setError("Reorder threshold must be a non-negative whole number.");
    setSaving(true);
    try {
      await onSubmit({
        name,
        unit,
        startingQuantity: starting,
        reorderThreshold: reorder,
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create item.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
      <Card
        className="w-full max-w-lg p-6 shadow-float"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-inventory-title"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Inventory setup
        </p>
        <h2 id="new-inventory-title" className="mt-1 text-xl font-black">
          New inventory item
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The selected unit becomes this item’s canonical unit.
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-semibold">
            Item name
            <Input
              aria-label="Inventory item name"
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Chicken"
              autoFocus
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-semibold">
              Canonical unit
              <select
                aria-label="Inventory unit"
                className="mt-1 min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as InventoryUnit)
                }
              >
                {units.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Starting quantity
              <Input
                aria-label="Starting quantity"
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={startingQuantity}
                onChange={(event) => setStartingQuantity(event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block text-sm font-semibold">
              Reorder threshold
              <Input
                aria-label="Reorder threshold"
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          {startingQuantity && Number(startingQuantity) > 0 ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Starting stock will be recorded as an opening movement.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create item"}
            </Button>
          </div>
        </form>
      </Card>
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "in_stock" | "low_stock" | "out_of_stock" | "inactive"
  >("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [action, setAction] = useState<{
    item: InventoryItem;
    type: InventoryAction;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  async function selectItem(id: string) {
    setSelectedId(id);
    setHistory(await onHistory(id));
  }

  async function submitAction(
    type: InventoryAction,
    quantity: number,
    reason: string,
  ) {
    if (!selected) return;
    if (type === "receive") await onReceive(selected.id, quantity, reason);
    if (type === "issue") await onIssue(selected.id, quantity, reason);
    if (type === "waste") await onWaste(selected.id, quantity, reason);
    if (type === "return") await onReturn(selected.id, quantity, reason);
    if (type === "adjust") await onAdjust(selected.id, quantity, reason);
    setHistory(await onHistory(selected.id));
  }

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!normalized || item.name.toLowerCase().includes(normalized)) &&
        (filter === "all"
          ? true
          : filter === "inactive"
            ? !item.active
            : item.active && item.stockState === filter),
    );
  }, [filter, items, query]);
  const counts = useMemo(
    () => ({
      total: items.filter((item) => item.active).length,
      low: items.filter(
        (item) => item.active && item.stockState === "low_stock",
      ).length,
      out: items.filter(
        (item) => item.active && item.stockState === "out_of_stock",
      ).length,
    }),
    [items],
  );

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <PageHeader
        title="Inventory"
        description="Track stock levels and inventory movements."
        action={
          <Button onClick={() => setCreating(true)}>New Inventory Item</Button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active items", value: counts.total },
          { label: "Low stock", value: counts.low },
          { label: "Out of stock", value: counts.out },
        ].map((summary) => (
          <Card key={summary.label} className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {summary.label}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {summary.value}
            </p>
          </Card>
        ))}
      </div>
      <Card className="shrink-0 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-64 flex-1">
            <span className="sr-only">Search inventory</span>
            <Input
              aria-label="Search inventory"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory"
            />
          </label>
          <div
            className="flex gap-1 overflow-x-auto"
            aria-label="Inventory filters"
          >
            {(
              [
                ["all", "All"],
                ["in_stock", "In stock"],
                ["low_stock", "Low stock"],
                ["out_of_stock", "Out of stock"],
                ["inactive", "Inactive"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 shrink-0 rounded-md px-3 text-sm font-semibold ${filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)]">
        <Card className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(130px,1fr)_110px_120px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>Item</span>
            <span>Current</span>
            <span>Reorder at</span>
            <span>Status</span>
          </div>
          <div className="max-h-[calc(100dvh-350px)] overflow-y-auto">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void selectItem(item.id)}
                aria-pressed={selected?.id === item.id}
                className={`grid w-full grid-cols-[minmax(0,1.4fr)_minmax(130px,1fr)_110px_120px] items-center gap-4 border-b px-5 py-4 text-left last:border-0 hover:bg-muted/40 ${selected?.id === item.id ? "bg-primary/[0.04]" : ""} ${!item.active ? "opacity-60" : ""}`}
              >
                <span className="min-w-0">
                  <strong className="block truncate">{item.name}</strong>
                  {!item.active ? (
                    <span className="text-xs text-muted-foreground">
                      Inactive
                    </span>
                  ) : null}
                </span>
                <strong className="text-base tabular-nums">
                  <Quantity value={item.currentQuantity} unit={item.unit} />
                </strong>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {item.reorderThreshold === null ? (
                    "—"
                  ) : (
                    <Quantity value={item.reorderThreshold} unit={item.unit} />
                  )}
                </span>
                <StatusBadge
                  kind="inventory"
                  value={item.active ? item.stockState : "inactive"}
                />
              </button>
            ))}
            {!visibleItems.length ? (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <p className="font-bold">
                    {items.length
                      ? "No inventory items match"
                      : "No inventory items yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {items.length
                      ? "Try another search or filter."
                      : "Add your first inventory item to begin tracking stock."}
                  </p>
                  {!items.length ? (
                    <Button className="mt-4" onClick={() => setCreating(true)}>
                      Add Inventory Item
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
        <Card className="min-h-0 overflow-hidden">
          <div className="border-b p-5">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Selected item
                    </p>
                    <h2 className="mt-1 text-xl font-black">{selected.name}</h2>
                  </div>
                  <StatusBadge
                    kind="inventory"
                    value={selected.active ? selected.stockState : "inactive"}
                  />
                </div>
                <p className="mt-3 text-2xl font-black tabular-nums">
                  <Quantity
                    value={selected.currentQuantity}
                    unit={selected.unit}
                  />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reorder threshold:{" "}
                  {selected.reorderThreshold === null ? (
                    "not set"
                  ) : (
                    <Quantity
                      value={selected.reorderThreshold}
                      unit={selected.unit}
                    />
                  )}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      setAction({ item: selected, type: "receive" })
                    }
                  >
                    Receive Stock
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAction({ item: selected, type: "issue" })}
                  >
                    Issue to Kitchen
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAction({ item: selected, type: "waste" })}
                  >
                    Record Waste
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setAction({ item: selected, type: "return" })
                    }
                  >
                    Return Stock
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setAction({ item: selected, type: "adjust" })
                    }
                  >
                    Adjust Count
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onToggleActive(selected)}
                  >
                    {selected.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Select an inventory item to inspect it.
              </div>
            )}
          </div>
          {selected ? (
            <div className="min-h-0 overflow-y-auto p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-black">Movement history</h3>
                <span className="text-xs text-muted-foreground">
                  Audit trail
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {history.map((movement) => (
                  <div
                    key={movement.id}
                    className="border-b pb-3 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {movementLabel(movement.type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMovementDate(movement.createdAt)}
                          {movement.createdBy ? ` · ${movement.createdBy}` : ""}
                        </p>
                      </div>
                      <strong
                        className={`tabular-nums ${movement.quantityDelta >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {movement.quantityDelta} {selected.unit}
                      </strong>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Balance{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {movement.balanceAfter} {selected.unit}
                      </span>
                      {movement.reason ? ` · ${movement.reason}` : ""}
                    </p>
                  </div>
                ))}
                {!history.length ? (
                  <p className="text-sm text-muted-foreground">
                    No movements recorded yet.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
      {action && (
        <InventoryActionDialog
          item={action.item}
          action={action.type}
          onClose={() => setAction(null)}
          onSubmit={submitAction}
        />
      )}
      {creating && (
        <NewInventoryItemDialog
          onClose={() => setCreating(false)}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}
