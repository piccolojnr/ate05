import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import {
  formatGhs,
  type MenuManagementData,
  type MenuManagementItem,
} from "../../lib/pos-client";

type MenuItemInput = {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  sellingPriceMinor: number;
  available: boolean;
  active: boolean;
};

function parsePriceMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function MenuItemForm({
  item,
  categories,
  onCancel,
  onSave,
}: {
  item?: MenuManagementItem;
  categories: MenuManagementData["categories"];
  onCancel: () => void;
  onSave: (input: MenuItemInput) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? categories[0]?.id ?? "",
  );
  const [price, setPrice] = useState(
    item ? (item.sellingPriceMinor / 100).toFixed(2) : "",
  );
  const [available, setAvailable] = useState(item?.available ?? true);
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sellingPriceMinor = parsePriceMinor(price);
    if (!name.trim()) return setError("Item name is required.");
    if (!categoryId) return setError("Choose a category.");
    if (sellingPriceMinor === null)
      return setError("Enter a price with up to two decimal places.");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: item?.id,
        name,
        description,
        categoryId,
        sellingPriceMinor,
        available,
        active,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save menu item.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <Card
        className="max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto p-6 shadow-floating"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-form-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Menu management
            </p>
            <h2 id="menu-item-form-title" className="mt-1 text-xl font-black">
              {item ? "Edit menu item" : "New menu item"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu item form"
            onClick={onCancel}
          >
            ×
          </Button>
        </div>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-semibold">
            Item name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="e.g. Fried Rice"
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-semibold">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
              className="mt-1 min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {categories
                  .filter((category) => category.active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Price (GHS)
              <Input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="50.00"
                className="mt-1"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm font-semibold">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={available}
                onChange={(event) => setAvailable(event.target.checked)}
              />{" "}
              Available for sale
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />{" "}
              Active item
            </label>
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : item ? "Save changes" : "Create item"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function MenuScreen({
  data,
  onCreate,
  onUpdate,
  onCreateCategory,
}: {
  data: MenuManagementData;
  onCreate: (input: Omit<MenuItemInput, "id">) => Promise<void>;
  onUpdate: (input: MenuItemInput & { id: string }) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [editing, setEditing] = useState<MenuManagementItem | null | undefined>(
    undefined,
  );
  const [categoryName, setCategoryName] = useState("");
  const normalized = query.trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      data.items.filter(
        (item) =>
          (!normalized ||
            item.name.toLowerCase().includes(normalized) ||
            item.categoryName.toLowerCase().includes(normalized)) &&
          (categoryId === "all" || item.categoryId === categoryId),
      ),
    [categoryId, data.items, normalized],
  );

  async function saveCategory() {
    if (!categoryName.trim()) return;
    await onCreateCategory(categoryName);
    setCategoryName("");
  }

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <PageHeader
        title="Menu"
        description="Manage items, categories, prices and availability."
        action={<Button onClick={() => setEditing(null)}>New Menu Item</Button>}
      />
      <Card className="shrink-0 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-64 flex-1">
            <span className="sr-only">Search menu items</span>
            <Input
              aria-label="Search menu items"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items or categories"
            />
          </label>
          <select
            aria-label="Filter menu category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="min-h-10 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All categories</option>
            {data.categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
          <div className="flex min-w-64 flex-1 gap-2">
            <Input
              aria-label="New category name"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="New category"
            />
            <Button
              variant="secondary"
              onClick={() => void saveCategory()}
              disabled={!categoryName.trim()}
            >
              Add category
            </Button>
          </div>
        </div>
      </Card>
      <Card className="min-h-0 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(120px,1fr)_110px_150px_100px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Item</span>
          <span>Category</span>
          <span className="text-right">Price</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>
        <div className="max-h-[calc(100dvh-250px)] overflow-y-auto">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1.5fr)_minmax(120px,1fr)_110px_150px_100px] items-center gap-4 border-b px-5 py-4 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{item.name}</p>
                {item.description ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <span className="truncate text-sm text-muted-foreground">
                {item.categoryName}
              </span>
              <span className="text-right tabular-nums font-black">
                {formatGhs(item.sellingPriceMinor)}
              </span>
              <div className="flex flex-wrap gap-1">
                <StatusBadge
                  value={
                    item.active
                      ? item.available
                        ? "available"
                        : "unavailable"
                      : "inactive"
                  }
                />
                <StatusBadge value={item.active ? "active" : "inactive"} />
              </div>
              <div className="text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => setEditing(item)}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
          {!visibleItems.length ? (
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div>
                <p className="font-bold">
                  {data.items.length
                    ? "No menu items match"
                    : "No menu items yet"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.items.length
                    ? "Try another search or category."
                    : "Add your first item to start selling."}
                </p>
                {!data.items.length ? (
                  <Button className="mt-4" onClick={() => setEditing(null)}>
                    Add Menu Item
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      {editing !== undefined ? (
        <MenuItemForm
          item={editing ?? undefined}
          categories={data.categories}
          onCancel={() => setEditing(undefined)}
          onSave={async (input) => {
            if (input.id) await onUpdate({ ...input, id: input.id });
            else await onCreate(input);
            setEditing(undefined);
          }}
        />
      ) : null}
    </div>
  );
}
