import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Checkbox, Input, Select, Textarea } from "@ate05/ui";
import { Icon } from "../../components/icons";
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

function CategoryManager({
  categories,
  onClose,
  onCreate,
}: {
  categories: MenuManagementData["categories"];
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add category.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-y-auto p-6 shadow-floating sm:max-h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Menu setup
            </p>
            <h2 id="category-manager-title" className="mt-1 text-xl font-black">
              Manage categories
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Categories keep the selling menu easy to scan. Items use these
              saved categories in POS.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close category manager"
            onClick={onClose}
          >
            ×
          </Button>
        </div>
        <form className="mt-5" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-semibold">
            New category name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="e.g. Breakfast"
              className="mt-1"
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Add category"}
            </Button>
          </div>
        </form>
        <div className="mt-5 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">Saved categories</h3>
            <span className="text-xs font-semibold text-muted-foreground">
              {categories.filter((category) => category.active).length} active
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories
              .filter((category) => category.active)
              .map((category) => (
                <span
                  key={category.id}
                  className="rounded-full border bg-muted/30 px-3 py-1.5 text-sm font-semibold"
                >
                  {category.name}
                </span>
              ))}
            {!categories.some((category) => category.active) ? (
              <p className="text-sm text-muted-foreground">
                No categories yet.
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
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
    item?.categoryId ??
      categories.find((category) => category.active)?.id ??
      "",
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
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <Card
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-y-auto p-6 shadow-floating sm:max-h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-form-title"
      >
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Menu management
            </p>
            <h2 id="menu-item-form-title" className="mt-1 text-xl font-black">
              {item ? "Edit menu item" : "New menu item"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prices affect new orders. Existing orders keep their snapshot.
            </p>
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
          className="mt-5 space-y-4"
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
            Description{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short description for staff"
              className="mt-1 min-h-20"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Category
              <Select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1 min-h-10"
              >
                {categories
                  .filter((category) => category.active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="block text-sm font-semibold">
              Price (GHS)
              <Input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="50.00"
                className="mt-1 tabular-nums"
              />
            </label>
          </div>
          <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Selling state
            </p>
            <label className="flex items-center gap-2 font-semibold">
              <Checkbox
                type="checkbox"
                checked={available}
                onChange={(event) => setAvailable(event.target.checked)}
              />
              Available for sale
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <Checkbox
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
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

function MenuItemRow({
  item,
  onEdit,
  onToggleAvailability,
}: {
  item: MenuManagementItem;
  onEdit: () => void;
  onToggleAvailability: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  async function toggle() {
    setWorking(true);
    try {
      await onToggleAvailability();
    } finally {
      setWorking(false);
    }
  }
  return (
    <article
      className={`grid gap-3 border-b px-4 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(110px,0.8fr)_120px_minmax(170px,0.9fr)_auto] xl:items-center ${!item.active ? "bg-muted/20" : "hover:bg-muted/20"}`}
    >
      <div className="min-w-0">
        <p
          className={`truncate font-bold ${!item.active ? "text-muted-foreground" : ""}`}
        >
          {item.name}
        </p>
        {item.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        ) : null}
      </div>
      <span className="truncate text-sm text-muted-foreground">
        {item.categoryName}
      </span>
      <span className="text-left tabular-nums font-black sm:text-right">
        {formatGhs(item.sellingPriceMinor)}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          value={
            !item.active
              ? "inactive"
              : item.available
                ? "available"
                : "unavailable"
          }
        />
        {!item.active ? (
          <span className="text-xs text-muted-foreground">Hidden from POS</span>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2 sm:justify-start xl:col-span-1">
        {item.active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void toggle()}
            disabled={working}
          >
            {working
              ? "Saving…"
              : item.available
                ? "Mark unavailable"
                : "Make available"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Edit ${item.name}`}
          onClick={onEdit}
        >
          Edit
        </Button>
      </div>
    </article>
  );
}

export function MenuScreen({
  data,
  onCreate,
  onUpdate,
  onCreateCategory,
  onToggleAvailability,
}: {
  data: MenuManagementData;
  onCreate: (input: Omit<MenuItemInput, "id">) => Promise<void>;
  onUpdate: (input: MenuItemInput & { id: string }) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onToggleAvailability: (item: MenuManagementItem) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [editing, setEditing] = useState<MenuManagementItem | null | undefined>(
    undefined,
  );
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
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
  const activeItems = data.items.filter((item) => item.active);
  const availableItems = activeItems.filter((item) => item.available);
  const unavailableItems = activeItems.filter((item) => !item.available);
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader
        title="Menu"
        description="Manage the items your team can sell today."
        action={<Button onClick={() => setEditing(null)}>New Menu Item</Button>}
      />
      <div
        className="grid grid-cols-3 divide-x rounded-lg border bg-card shadow-card"
        aria-label="Menu summary"
      >
        <div className="px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold text-muted-foreground">
            Total items
          </p>
          <p className="mt-1 text-xl font-black tabular-nums">
            {data.items.length}
          </p>
        </div>
        <div className="px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold text-muted-foreground">
            Available now
          </p>
          <p className="mt-1 text-xl font-black tabular-nums text-success">
            {availableItems.length}
          </p>
        </div>
        <div className="px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold text-muted-foreground">
            Unavailable
          </p>
          <p className="mt-1 text-xl font-black tabular-nums text-warning">
            {unavailableItems.length}
          </p>
        </div>
      </div>
      <Card className="shrink-0 p-3 shadow-none">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search menu items</span>
            <Icon
              name="search"
              width="17"
              height="17"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search menu items"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items or categories"
              className="min-h-10 pl-9"
            />
          </label>
          <Select
            aria-label="Filter menu category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="min-h-10 w-full xl:w-52"
          >
            <option value="all">All categories</option>
            {data.categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
          <Button
            variant="secondary"
            className="w-full xl:w-auto"
            onClick={() => setCategoryManagerOpen(true)}
          >
            Manage categories
          </Button>
        </div>
        {query || categoryId !== "all" ? (
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}{" "}
              shown
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setCategoryId("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>
      <Card className="min-h-0 overflow-hidden shadow-none">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3 sm:px-5">
          <div>
            <h2 className="font-black">Menu items</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Availability changes are reflected in POS immediately.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {visibleItems.length} of {data.items.length}
          </span>
        </div>
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(110px,0.8fr)_120px_minmax(170px,0.9fr)_auto] gap-4 border-b px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground xl:grid">
          <span>Item</span>
          <span>Category</span>
          <span className="text-right">Price</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <div className="max-h-[calc(100dvh-360px)] overflow-y-auto">
          {visibleItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onToggleAvailability={() => onToggleAvailability(item)}
            />
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
      {categoryManagerOpen ? (
        <CategoryManager
          categories={data.categories}
          onClose={() => setCategoryManagerOpen(false)}
          onCreate={onCreateCategory}
        />
      ) : null}
    </div>
  );
}
