import { useMemo, useState } from "react";
import { Badge, Button, cn } from "@ate05/ui";
import { Icon } from "./components/icons";
import { MenuCatalog } from "./components/menu-catalog";
import { OrderPanel, type OrderLine } from "./components/order-panel";
import { Sidebar } from "./components/sidebar";
import { categories, menuItems, type NavigationItem } from "./data";
import {
  InventoryScreen,
  MenuScreen,
  OrdersScreen,
  SettingsScreen,
  TablesScreen,
} from "./screens/placeholders";

const starterLines: OrderLine[] = [
  { id: "jollof", name: "Assorted Jollof Rice", price: 59.99, quantity: 1 },
  { id: "chicken", name: "Fried Chicken", price: 25, quantity: 1 },
  { id: "coke", name: "Tropical Sunset", price: 60, quantity: 1 },
];

export function App() {
  const [activeScreen, setActiveScreen] = useState<NavigationItem>("POS");
  const [category, setCategory] = useState(categories[0] ?? "All");
  const [lines, setLines] = useState<OrderLine[]>(starterLines);
  const itemCount = useMemo(
    () => lines.reduce((total, line) => total + line.quantity, 0),
    [lines],
  );
  function addItem(id: string) {
    const item = menuItems.find((menuItem) => menuItem.id === id);
    if (!item) return;
    setLines((current) => {
      const line = current.find((entry) => entry.id === item.id);
      return line
        ? current.map((entry) =>
            entry.id === item.id
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          )
        : [
            ...current,
            { id: item.id, name: item.name, price: item.price, quantity: 1 },
          ];
    });
  }
  function changeQuantity(id: string, amount: number) {
    setLines((current) =>
      current.flatMap((line) =>
        line.id !== id
          ? [line]
          : line.quantity + amount > 0
            ? [{ ...line, quantity: line.quantity + amount }]
            : [],
      ),
    );
  }
  const content =
    activeScreen === "POS" ? (
      <div className="flex h-full min-h-0 gap-6">
        <MenuCatalog
          category={category}
          onCategoryChange={setCategory}
          onAdd={addItem}
        />
        <OrderPanel lines={lines} onQuantityChange={changeQuantity} />
      </div>
    ) : (
      <div className="mx-auto max-w-6xl">
        {activeScreen === "Orders" && <OrdersScreen />}
        {activeScreen === "Tables" && <TablesScreen />}
        {activeScreen === "Menu" && <MenuScreen />}
        {activeScreen === "Inventory" && <InventoryScreen />}
        {activeScreen === "Settings" && <SettingsScreen />}
      </div>
    );
  return (
    <main className="flex h-screen min-h-[680px] overflow-hidden bg-background text-foreground">
      <Sidebar active={activeScreen} onNavigate={setActiveScreen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-muted-foreground">
              Tuesday, 18 June
            </span>
            <span className="hidden h-4 border-l sm:block" />
            <span className="hidden text-sm text-muted-foreground sm:block">
              12:42 PM
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" aria-label="Search">
              <Icon name="search" />
            </Button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-1 pr-3 hover:bg-muted"
            >
              <span className="grid size-9 place-items-center rounded-full bg-slate-800 text-xs font-black text-white">
                RA
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-bold">Rahim A.</span>
                <span className="block text-xs text-muted-foreground">
                  Cashier
                </span>
              </span>
            </button>
          </div>
        </header>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto",
            activeScreen === "POS" ? "p-6" : "p-8",
          )}
        >
          <div className="mb-3 flex items-center gap-2 lg:hidden">
            <Badge tone="primary">{itemCount} items in current order</Badge>
          </div>
          {content}
        </div>
      </div>
    </main>
  );
}
