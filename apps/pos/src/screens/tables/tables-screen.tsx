import { useState, type FormEvent } from "react";
import { Button, Card, Checkbox, Input } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import type { RestaurantTable } from "../../lib/pos-client";

function TableDialog({
  table,
  onClose,
  onSubmit,
}: {
  table?: RestaurantTable;
  onClose: () => void;
  onSubmit: (input: {
    id?: string;
    name: string;
    capacity: number;
    active: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [active, setActive] = useState(table?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsedCapacity = Number(capacity);
    if (!name.trim()) return setError("Table name is required.");
    if (!Number.isSafeInteger(parsedCapacity) || parsedCapacity <= 0)
      return setError("Capacity must be a positive whole number.");
    setSaving(true);
    try {
      await onSubmit({ id: table?.id, name, capacity: parsedCapacity, active });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save table.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
      <Card
        className="w-full max-w-md p-6 shadow-floating"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-dialog-title"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Table management
        </p>
        <h2 id="table-dialog-title" className="mt-1 text-xl font-black">
          {table ? "Edit table" : "Add table"}
        </h2>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-semibold">
            Table name
            <Input
              aria-label="Table name"
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Patio 1"
              autoFocus
            />
          </label>
          <label className="block text-sm font-semibold">
            Capacity
            <Input
              aria-label="Table capacity"
              className="mt-1"
              type="number"
              min="1"
              step="1"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Checkbox
              aria-label="Table active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />{" "}
            Active table
          </label>
          {error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : table ? "Save changes" : "Add table"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function TablesScreen({
  tables,
  onCreate,
  onUpdate,
  onReserve,
  onStartOrder,
  onOpenOrder,
}: {
  tables: RestaurantTable[];
  onCreate: (input: {
    name: string;
    capacity: number;
    active: boolean;
  }) => Promise<void>;
  onUpdate: (input: {
    id: string;
    name: string;
    capacity: number;
    active: boolean;
  }) => Promise<void>;
  onReserve: (tableId: string, reserved: boolean) => Promise<void>;
  onStartOrder: (tableId: string) => void;
  onOpenOrder: (tableId: string) => void;
}) {
  const [editing, setEditing] = useState<RestaurantTable | null | undefined>(
    undefined,
  );
  const [showInactive, setShowInactive] = useState(false);
  const visibleTables = tables.filter((table) => showInactive || table.active);
  return (
    <div className="flex min-h-0 flex-col gap-5">
      <PageHeader
        title="Tables"
        description="Manage seating, reservations and table turnover."
        action={<Button onClick={() => setEditing(null)}>Add Table</Button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {visibleTables.length} table{visibleTables.length === 1 ? "" : "s"}{" "}
          shown
        </p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Checkbox
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />{" "}
          Show inactive
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleTables.map((table) => (
          <Card
            key={table.id}
            className={`p-5 ${!table.active ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">{table.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capacity {table.capacity}
                </p>
              </div>
              <StatusBadge
                kind="table"
                value={table.active ? table.status : "inactive"}
              />
            </div>
            {table.status === "occupied" ? (
              <div className="mt-5 rounded-md bg-muted/60 p-3 text-sm">
                <p className="font-semibold">Active order at this table</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Completing the order will make this table available.
                </p>
              </div>
            ) : table.status === "reserved" ? (
              <p className="mt-5 text-sm text-muted-foreground">
                Reserved · ready to start when guests arrive.
              </p>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Available for a new dine-in order.
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              {table.status === "occupied" ? (
                <Button size="sm" onClick={() => onOpenOrder(table.id)}>
                  Open Order
                </Button>
              ) : table.active ? (
                <Button size="sm" onClick={() => onStartOrder(table.id)}>
                  Start Order
                </Button>
              ) : null}
              {table.active && table.status !== "occupied" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void onReserve(table.id, table.status !== "reserved")
                  }
                >
                  {table.status === "reserved"
                    ? "Release reservation"
                    : "Reserve"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(table)}
              >
                Manage
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {!visibleTables.length ? (
        <Card className="grid min-h-48 place-items-center p-8 text-center">
          <div>
            <p className="font-bold">
              {tables.length ? "No active tables shown" : "No tables yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a table to begin seating dine-in orders.
            </p>
            {!tables.length ? (
              <Button className="mt-4" onClick={() => setEditing(null)}>
                Add Table
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
      {editing !== undefined ? (
        <TableDialog
          table={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSubmit={(input) =>
            input.id
              ? onUpdate({
                  id: input.id,
                  name: input.name,
                  capacity: input.capacity,
                  active: input.active,
                })
              : onCreate({
                  name: input.name,
                  capacity: input.capacity,
                  active: input.active,
                })
          }
        />
      ) : null}
    </div>
  );
}
