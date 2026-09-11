import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, cn, Input } from "@ate05/ui";
import { Icon } from "./icons";
import {
  formatGhs,
  type MenuCategory,
  type MenuItem,
  type OrderType,
  type RestaurantTable,
} from "../lib/pos-client";

function MenuCategoryBar({
  category,
  categories,
  onCategoryChange,
}: {
  category: string;
  categories: MenuCategory[];
  onCategoryChange: (category: string) => void;
}) {
  return (
    <div
      className="flex min-w-0 gap-1 overflow-x-auto pb-1"
      aria-label="Menu categories"
    >
      {[{ id: "All", name: "All" }, ...categories].map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={category === entry.id}
          onClick={() => onCategoryChange(entry.id)}
          className={cn(
            "min-h-9 shrink-0 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            category === entry.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {entry.name}
        </button>
      ))}
    </div>
  );
}

function MenuItemTile({
  item,
  categoryName,
  onAdd,
}: {
  item: MenuItem;
  categoryName?: string;
  onAdd: (id: string) => void;
}) {
  return (
    <button
      className="group flex min-h-[132px] flex-col rounded-md border bg-card p-3 text-left shadow-none transition-colors hover:border-primary/50 hover:bg-primary/[0.03] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      type="button"
      onClick={() => onAdd(item.id)}
      aria-label={`Add ${item.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-bold leading-tight">{item.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {categoryName ?? "Menu item"}
          </p>
        </div>
        <p className="shrink-0 tabular-nums text-sm font-black text-primary">
          {formatGhs(item.sellingPriceMinor).replace("GHS ", "")}
        </p>
      </div>
      {item.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : null}
      <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-bold text-primary">
        <Icon name="plus" width="15" height="15" /> Add item
      </span>
    </button>
  );
}

export function MenuCatalog({
  category,
  onCategoryChange,
  onAdd,
  categories,
  items,
  orderType,
  onOrderTypeChange,
  tableId,
  tables,
  onTableChange,
  orderNumber,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
  onAdd: (id: string) => void;
  categories: MenuCategory[];
  items: MenuItem[];
  orderType: OrderType;
  onOrderTypeChange: (type: OrderType) => void;
  tableId: string | null;
  tables: RestaurantTable[];
  onTableChange: (tableId: string) => void;
  orderNumber?: number;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches(
        "input, textarea, select, [contenteditable='true']",
      );
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (typing && target !== searchRef.current) return;
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (
        event.key === "Escape" &&
        query &&
        (!typing || target === searchRef.current)
      ) {
        event.preventDefault();
        setQuery("");
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [query]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory =
        category === "All" || item.categoryId === category;
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description?.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, items, query]);
  const selectedTable = tables.find((table) => table.id === tableId);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      aria-label="Menu catalog"
    >
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Point of sale
          </p>
          <h1 className="mt-1 truncate text-xl font-black tracking-tight">
            {orderNumber
              ? `Order #${String(orderNumber).padStart(4, "0")}`
              : "New order"}
          </h1>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-xs font-semibold text-muted-foreground">
            {orderType === "dine_in"
              ? (selectedTable?.name ?? "Select a table")
              : "TAKEAWAY"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Current sale</p>
        </div>
      </header>

      <Card className="shrink-0 p-3 shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-muted p-1" aria-label="Order type">
            <button
              type="button"
              aria-pressed={orderType === "dine_in"}
              onClick={() => onOrderTypeChange("dine_in")}
              className={cn(
                "min-h-9 rounded px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                orderType === "dine_in"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Dine-in
            </button>
            <button
              type="button"
              aria-pressed={orderType === "takeaway"}
              onClick={() => onOrderTypeChange("takeaway")}
              className={cn(
                "min-h-9 rounded px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                orderType === "takeaway"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Takeaway
            </button>
          </div>
          {orderType === "dine_in" ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              <span className="mr-1 shrink-0 text-xs font-semibold text-muted-foreground">
                Table
              </span>
              {tables
                .filter((table) => table.active)
                .map((table) => (
                  <Button
                    className={cn(
                      "min-w-12 shrink-0",
                      tableId === table.id &&
                        "!border-primary !bg-primary !text-white",
                    )}
                    key={table.id}
                    size="sm"
                    variant="secondary"
                    disabled={table.status === "occupied"}
                    onClick={() => onTableChange(table.id)}
                  >
                    {table.name.replace("Table ", "T")}
                  </Button>
                ))}
            </div>
          ) : (
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              TAKEAWAY
            </span>
          )}
        </div>
        {orderType === "dine_in" && selectedTable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Seating at{" "}
            <strong className="text-foreground">{selectedTable.name}</strong>
          </p>
        ) : null}
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 shadow-none">
        <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <MenuCategoryBar
            category={category}
            categories={categories}
            onCategoryChange={onCategoryChange}
          />
          <label className="relative block shrink-0 sm:w-52">
            <span className="sr-only">Search menu</span>
            <Icon
              name="search"
              width="17"
              height="17"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              aria-label="Search menu"
              aria-keyshortcuts="Control+K Meta+K"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-10 pl-9 pr-10"
              placeholder="Search menu"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear menu search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            ) : null}
          </label>
        </div>
        <div
          aria-label="Menu items"
          role="region"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visibleItems.length ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <MenuItemTile
                  key={item.id}
                  item={item}
                  categoryName={
                    categories.find((entry) => entry.id === item.categoryId)
                      ?.name
                  }
                  onAdd={onAdd}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-48 place-items-center rounded-md border border-dashed bg-muted/30 p-6 text-center">
              <div>
                <p className="font-bold">No menu items found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try another category or search term.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
