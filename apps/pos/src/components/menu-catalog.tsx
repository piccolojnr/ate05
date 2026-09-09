import { Button, Card, cn, Input } from "@ate05/ui";
import {
  formatGhs,
  type MenuCategory,
  type MenuItem,
  type OrderType,
  type RestaurantTable,
} from "../lib/pos-client";

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
  const visibleItems =
    category === "All"
      ? items
      : items.filter((item) => item.categoryId === category);
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            Counter 01 · Open
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {orderNumber
              ? `Order #${String(orderNumber).padStart(4, "0")}`
              : "New order"}
          </h1>
        </div>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Tuesday · 12:42 PM
        </p>
      </header>
      <Card className="grid gap-4 p-4 shadow-none xl:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="mr-2 text-lg">
            {orderNumber ? `#${orderNumber}` : "Draft"}
          </strong>
          <Button
            onClick={() => onOrderTypeChange("dine_in")}
            variant={orderType === "dine_in" ? "primary" : "secondary"}
          >
            Dine-in
          </Button>
          <Button
            onClick={() => onOrderTypeChange("takeaway")}
            variant={orderType === "takeaway" ? "primary" : "secondary"}
          >
            Takeaway
          </Button>
          <Input
            aria-label="Customer name"
            className="h-10 min-w-[190px] flex-1 bg-card text-sm focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Customer (optional)"
          />
        </div>
        {orderType === "dine_in" ? (
          <div className="grid grid-cols-4 gap-2">
            {tables.map((table) => (
              <Button
                className={cn(
                  "min-w-12",
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
        ) : null}
      </Card>
      <Card className="min-h-0 flex-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Menu categories">
            <Button
              variant="secondary"
              size="sm"
              className={cn(
                category === "All" && "!border-primary !bg-primary !text-white",
              )}
              onClick={() => onCategoryChange("All")}
            >
              All
            </Button>
            {categories.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                size="sm"
                className={cn(
                  category === item.id &&
                    "!border-primary !bg-primary !text-white",
                )}
                onClick={() => onCategoryChange(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <Input
            aria-label="Search menu"
            className="h-10 w-full bg-card text-sm sm:w-56"
            placeholder="Search menu..."
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <button
              className="group min-h-[190px] overflow-hidden rounded-lg border bg-card text-left shadow-card transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              type="button"
              onClick={() => onAdd(item.id)}
              aria-label={`Add ${item.name}`}
              key={item.id}
            >
              <div
                className={cn(
                  "flex h-24 items-end justify-between p-3",
                  "bg-primary/10",
                )}
              >
                <span className="rounded-full bg-card/80 px-2.5 py-1 text-xs font-bold text-foreground">
                  {
                    categories.find(
                      (category) => category.id === item.categoryId,
                    )?.name
                  }
                </span>
                <span className="text-xl font-black text-foreground/60">
                  GH₵
                </span>
              </div>
              <div className="flex min-h-[94px] flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{item.name}</p>
                  <p className="shrink-0 text-sm font-black text-primary">
                    {formatGhs(item.sellingPriceMinor).replace("GHS ", "")}
                  </p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <span className="mt-auto pt-2 text-xs font-bold text-foreground group-hover:text-primary">
                  Tap to add
                </span>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}
