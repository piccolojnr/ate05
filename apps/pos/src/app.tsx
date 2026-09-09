import { useEffect, useMemo, useState } from "react";
import { Badge, Button, cn } from "@ate05/ui";
import { Icon } from "./components/icons";
import { MenuCatalog } from "./components/menu-catalog";
import { OrderPanel } from "./components/order-panel";
import { Sidebar } from "./components/sidebar";
import { type NavigationItem } from "./data";
import { getPosClient } from "./lib/get-pos-client";
import type { OpenOrder, PosBootstrap, PosOrder } from "./lib/pos-client";
import {
  InventoryScreen,
  MenuScreen,
  OrdersScreen,
  SettingsScreen,
  TablesScreen,
} from "./screens/placeholders";

const client = getPosClient();

export function App() {
  const [activeScreen, setActiveScreen] = useState<NavigationItem>("POS");
  const [bootstrap, setBootstrap] = useState<PosBootstrap | null>(null);
  const [order, setOrder] = useState<PosOrder | null>(null);
  const [category, setCategory] = useState("All");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [loading, setLoading] = useState(true);
  const itemCount = useMemo(
    () => order?.items.reduce((total, line) => total + line.quantity, 0) ?? 0,
    [order],
  );

  async function refresh() {
    setLoading(true);
    try {
      setBootstrap(await client.bootstrap());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load local restaurant data.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function addItem(menuItemId: string) {
    setNotice(null);
    try {
      const updated = await client.addMenuItem({
        orderId: order?.id,
        menuItemId,
        orderType,
        tableId,
      });
      setOrder(updated);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add this item.",
      );
    }
  }
  async function changeQuantity(itemId: string, quantity: number) {
    if (!order) return;
    try {
      setNotice(null);
      setOrder(
        await client.updateOrderItemQuantity(order.id, itemId, quantity),
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update this item.",
      );
    }
  }
  async function changeNote(itemId: string, notes: string) {
    if (!order) return;
    try {
      setNotice(null);
      setOrder(await client.updateOrderItemNote(order.id, itemId, notes));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save this note.",
      );
    }
  }
  async function sendToKitchen() {
    if (!order) return;
    setSendingToKitchen(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await client.sendOrderToKitchen(order.id);
      setOrder(updated);
      await refresh();
      setNotice(
        `${updated.kitchenTickets.at(-1)?.type === "initial" ? "Initial" : "Kitchen"} ticket sent successfully.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to send this order to the kitchen.",
      );
    } finally {
      setSendingToKitchen(false);
    }
  }
  async function openOrder(summary: OpenOrder) {
    try {
      setOrder(await client.getOrder(summary.id));
      setOrderType(summary.orderType);
      setTableId(summary.tableId);
      setActiveScreen("POS");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to reopen this order.",
      );
    }
  }
  const content =
    activeScreen === "POS" ? (
      <div className="flex h-full min-h-0 gap-6">
        <MenuCatalog
          category={category}
          onCategoryChange={setCategory}
          onAdd={addItem}
          categories={bootstrap?.categories ?? []}
          items={bootstrap?.items ?? []}
          orderType={order?.orderType ?? orderType}
          onOrderTypeChange={(type) => {
            if (!order) {
              setOrderType(type);
              setTableId(null);
            }
          }}
          tableId={order?.tableId ?? tableId}
          tables={bootstrap?.tables ?? []}
          onTableChange={setTableId}
          orderNumber={order?.orderNumber}
        />
        <OrderPanel
          order={order}
          onQuantityChange={changeQuantity}
          onNoteChange={changeNote}
          onSendToKitchen={sendToKitchen}
          sendingToKitchen={sendingToKitchen}
        />
      </div>
    ) : (
      <div className="mx-auto max-w-6xl">
        {activeScreen === "Orders" && (
          <OrdersScreen
            orders={bootstrap?.openOrders ?? []}
            onOpenOrder={openOrder}
          />
        )}
        {activeScreen === "Tables" && (
          <TablesScreen tables={bootstrap?.tables ?? []} />
        )}
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
          {loading ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Loading local restaurant data…
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="mb-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
            >
              {notice}
            </p>
          ) : null}
          {content}
        </div>
      </div>
    </main>
  );
}
