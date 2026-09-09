import { Button, Card, cn } from "@ate05/ui";
import { Input } from "@/components/ui/input";
import { categories, menuItems } from "../data";

export function MenuCatalog({
  category,
  onCategoryChange,
  onAdd,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
  onAdd: (id: string) => void;
}) {
  const visibleItems =
    category === "All"
      ? menuItems
      : menuItems.filter((item) => item.category === category);
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            Counter 01 · Open
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">New order</h1>
        </div>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Tuesday · 12:42 PM
        </p>
      </header>
      <Card className="grid gap-4 p-4 shadow-none xl:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="mr-2 text-lg">#A05021</strong>
          <Button>Dine-in</Button>
          <Button variant="secondary">Takeaway</Button>
          <Input
            aria-label="Customer name"
            className="h-10 min-w-[190px] flex-1 bg-card text-sm focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Customer (optional)"
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {["T01", "T02", "T03", "T04"].map((table) => (
            <Button
              className={cn(
                "min-w-12",
                table === "T04" && "!border-primary !bg-primary !text-white",
              )}
              key={table}
              size="sm"
              variant="secondary"
            >
              {table}
            </Button>
          ))}
        </div>
      </Card>
      <Card className="min-h-0 flex-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Menu categories">
            {categories.map((item) => (
              <Button
                key={item}
                variant="secondary"
                size="sm"
                className={cn(
                  category === item &&
                    "!border-primary !bg-primary !text-white",
                )}
                onClick={() => onCategoryChange(item)}
              >
                {item}
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
                  item.color,
                )}
              >
                <span className="rounded-full bg-card/80 px-2.5 py-1 text-xs font-bold text-foreground">
                  {item.category}
                </span>
                <span className="text-xl font-black text-foreground/60">
                  GH₵
                </span>
              </div>
              <div className="flex min-h-[94px] flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{item.name}</p>
                  <p className="shrink-0 text-sm font-black text-primary">
                    {item.price.toFixed(2)}
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
