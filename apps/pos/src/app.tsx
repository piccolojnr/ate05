import { useEffect, useMemo, useState } from "react";
import { Badge } from "@ate05/ui";
import { AppShell } from "./components/app-shell";
import { MenuCatalog } from "./components/menu-catalog";
import { OrderPanel } from "./components/order-panel";
import { type NavigationItem } from "./data";
import { getPosClient } from "./lib/get-pos-client";
import type {
  OpenOrder,
  PosBootstrap,
  PosClient,
  PosOrder,
  PosPrinterConfig,
} from "./lib/pos-client";
import { formatGhs } from "./lib/pos-client";
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
  const [printers, setPrinters] = useState<PosPrinterConfig[]>([]);
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
      const [nextBootstrap, nextPrinters] = await Promise.all([
        client.bootstrap(),
        client.listPrinters(),
      ]);
      setBootstrap(nextBootstrap);
      setPrinters(nextPrinters);
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
    const previousTicketCount = order.kitchenTickets.length;
    setSendingToKitchen(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await client.sendOrderToKitchen(order.id);
      setOrder(updated);
      await refresh();
      const newTickets = updated.kitchenTickets.slice(previousTicketCount);
      setNotice(
        newTickets.some((ticket) => ticket.printStatus === "failed")
          ? "Order sent to kitchen, but the printer is offline. Ticket saved and waiting to print."
          : newTickets.some((ticket) => ticket.printStatus !== "printed")
            ? "Order sent to kitchen. Ticket saved and waiting to print."
            : "Kitchen ticket printed.",
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
  async function reprintTicket(ticketId: string) {
    if (!order) return;
    try {
      await client.reprintKitchenTicket(order.id, ticketId);
      setOrder(await client.getOrder(order.id));
      setNotice("Kitchen ticket reprinted.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to reprint ticket.",
      );
    }
  }
  async function recordPayment(
    input: Parameters<PosClient["recordPayment"]>[0],
  ) {
    setError(null);
    setNotice(null);
    try {
      const updated = await client.recordPayment(input);
      setOrder(updated);
      await refresh();
      setNotice(
        updated.paymentStatus === "paid"
          ? updated.receipt?.printStatus === "printed"
            ? "Payment recorded successfully. Receipt printed."
            : "Payment recorded successfully. Receipt saved and can be reprinted."
          : "Payment recorded. Remaining balance: " +
              formatGhs(updated.amountDueMinor),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
    }
  }
  async function reprintReceipt() {
    if (!order) return;
    try {
      await client.reprintReceipt(order.id);
      setOrder(await client.getOrder(order.id));
      setNotice("Receipt reprinted.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to reprint receipt.",
      );
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
  async function savePrinter(input: Parameters<PosClient["savePrinter"]>[0]) {
    setError(null);
    const saved = await client.savePrinter(input);
    setPrinters((current) => [
      ...current.filter((printer) => printer.id !== saved.id),
      saved,
    ]);
  }
  async function testPrinter(printerId: string) {
    setError(null);
    await client.testPrinter(printerId);
  }
  async function retryPendingPrints() {
    setError(null);
    const updatedOrders = await client.retryPendingKitchenPrints();
    const current = updatedOrders.find((entry) => entry.id === order?.id);
    if (current) setOrder(current);
    await refresh();
  }
  async function retryPendingReceiptPrints() {
    setError(null);
    const updatedOrders = await client.retryPendingReceiptPrints();
    const current = updatedOrders.find((entry) => entry.id === order?.id);
    if (current) setOrder(current);
    await refresh();
  }
  async function refreshInventory() {
    if (!bootstrap) return;
    setBootstrap({ ...bootstrap, inventory: await client.listInventory() });
  }
  async function inventoryAction(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refreshInventory();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update inventory.",
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
          onReprintTicket={(ticketId) => void reprintTicket(ticketId)}
          onRecordPayment={recordPayment}
          onReprintReceipt={reprintReceipt}
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
        {activeScreen === "Inventory" && (
          <InventoryScreen
            items={bootstrap?.inventory ?? []}
            onCreate={(input) =>
              inventoryAction(() => client.createInventoryItem(input))
            }
            onReceive={(id, quantity, reason) =>
              inventoryAction(() => client.receiveStock(id, quantity, reason))
            }
            onIssue={(id, quantity, reason) =>
              inventoryAction(() => client.issueStock(id, quantity, reason))
            }
            onWaste={(id, quantity, reason) =>
              inventoryAction(() => client.recordWaste(id, quantity, reason))
            }
            onReturn={(id, quantity, reason) =>
              inventoryAction(() => client.returnStock(id, quantity, reason))
            }
            onAdjust={(id, quantity, reason) =>
              inventoryAction(() =>
                client.adjustStockToCount(id, quantity, reason),
              )
            }
            onHistory={(id) => client.listStockMovements(id)}
            onToggleActive={(item) =>
              inventoryAction(() =>
                client.updateInventoryItem({
                  id: item.id,
                  name: item.name,
                  unit: item.unit,
                  reorderThreshold: item.reorderThreshold,
                  active: !item.active,
                }),
              )
            }
          />
        )}
        {activeScreen === "Settings" && (
          <SettingsScreen
            key={
              printers.find((printer) => printer.role === "kitchen")?.id ??
              "no-kitchen-printer"
            }
            printers={printers}
            onSavePrinter={savePrinter}
            onTestPrinter={testPrinter}
            onRetryPrints={retryPendingPrints}
            onRetryReceiptPrints={retryPendingReceiptPrints}
          />
        )}
      </div>
    );
  return (
    <AppShell active={activeScreen} onNavigate={setActiveScreen}>
      <div
        className={`min-h-0 flex-1 overflow-auto ${activeScreen === "POS" ? "p-6" : "p-8"}`}
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
    </AppShell>
  );
}
