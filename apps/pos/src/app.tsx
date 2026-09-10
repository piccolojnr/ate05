import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@ate05/ui";
import { notify } from "./lib/notifications";
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
import { TablesScreen } from "./screens/tables/tables-screen";
import { MenuScreen } from "./screens/menu/menu-screen";
import { InventoryScreen } from "./screens/inventory/inventory-screen";
import { SettingsScreen } from "./screens/settings/settings-screen";
import type { MenuManagementData } from "./lib/pos-client";
import { OrdersScreen } from "./screens/orders/orders-screen";

const client = getPosClient();

export function App() {
  const [activeScreen, setActiveScreen] = useState<NavigationItem>("POS");
  const [bootstrap, setBootstrap] = useState<PosBootstrap | null>(null);
  const [printers, setPrinters] = useState<PosPrinterConfig[]>([]);
  const [menuManagement, setMenuManagement] =
    useState<MenuManagementData | null>(null);
  const [order, setOrder] = useState<PosOrder | null>(null);
  const [category, setCategory] = useState("All");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [loading, setLoading] = useState(true);
  const itemCount = useMemo(
    () => order?.items.reduce((total, line) => total + line.quantity, 0) ?? 0,
    [order],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBootstrap, nextPrinters, nextMenu] = await Promise.all([
        client.bootstrap(),
        client.listPrinters(),
        client.listMenuManagement(),
      ]);
      setBootstrap(nextBootstrap);
      setPrinters(nextPrinters);
      setMenuManagement(nextMenu);
    } catch (cause) {
      notify.error(
        cause instanceof Error
          ? cause.message
          : "Unable to load local restaurant data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  async function refreshMenu() {
    setMenuManagement(await client.listMenuManagement());
    const nextBootstrap = await client.bootstrap();
    setBootstrap(nextBootstrap);
  }
  async function saveMenuItem(
    input: Parameters<PosClient["createMenuItem"]>[0] & { id?: string },
  ) {
    try {
      if (input.id)
        await client.updateMenuItem(
          input as Parameters<PosClient["updateMenuItem"]>[0],
        );
      else await client.createMenuItem(input);
      await refreshMenu();
      notify.success(input.id ? "Menu item updated." : "Menu item created.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to save menu item.",
      );
      throw cause;
    }
  }
  async function createMenuCategory(name: string) {
    try {
      await client.createMenuCategory(name);
      await refreshMenu();
      notify.success("Category created.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to create category.",
      );
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  async function addItem(menuItemId: string) {
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
      notify.error(
        cause instanceof Error ? cause.message : "Unable to add this item.",
      );
    }
  }
  async function changeQuantity(itemId: string, quantity: number) {
    if (!order) return;
    try {
      setOrder(
        await client.updateOrderItemQuantity(order.id, itemId, quantity),
      );
      await refresh();
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to update this item.",
      );
    }
  }
  async function changeNote(itemId: string, notes: string) {
    if (!order) return;
    try {
      setOrder(await client.updateOrderItemNote(order.id, itemId, notes));
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to save this note.",
      );
    }
  }
  async function sendToKitchen() {
    if (!order) return;
    const previousTicketCount = order.kitchenTickets.length;
    setSendingToKitchen(true);
    try {
      const updated = await client.sendOrderToKitchen(order.id);
      setOrder(updated);
      await refresh();
      const newTickets = updated.kitchenTickets.slice(previousTicketCount);
      if (newTickets.some((ticket) => ticket.printStatus === "failed")) {
        notify.warning(
          "Order sent to kitchen, but the printer is offline. Ticket saved and waiting to print.",
        );
      } else if (
        newTickets.some((ticket) => ticket.printStatus !== "printed")
      ) {
        notify.info(
          "Order sent to kitchen. Ticket saved and waiting to print.",
        );
      } else {
        notify.success("Kitchen ticket printed.");
      }
    } catch (cause) {
      notify.error(
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
      notify.success("Kitchen ticket reprinted.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to reprint ticket.",
      );
    }
  }
  async function recordPayment(
    input: Parameters<PosClient["recordPayment"]>[0],
  ) {
    try {
      const updated = await client.recordPayment(input);
      setOrder(updated);
      await refresh();
      notify.info(
        updated.paymentStatus === "paid"
          ? updated.receipt?.printStatus === "printed"
            ? "Payment recorded successfully. Receipt printed."
            : "Payment recorded successfully. Receipt saved and can be reprinted."
          : "Payment recorded. Remaining balance: " +
              formatGhs(updated.amountDueMinor),
      );
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
    }
  }
  async function reprintReceipt() {
    if (!order) return;
    try {
      await client.reprintReceipt(order.id);
      setOrder(await client.getOrder(order.id));
      notify.success("Receipt reprinted.");
    } catch (cause) {
      notify.error(
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
      notify.error(
        cause instanceof Error ? cause.message : "Unable to reopen this order.",
      );
    }
  }
  function startTableOrder(tableId: string) {
    setOrder(null);
    setOrderType("dine_in");
    setTableId(tableId);
    setCategory("All");
    setActiveScreen("POS");
  }
  function openTableOrder(tableId: string) {
    const summary = bootstrap?.openOrders.find(
      (entry) => entry.tableId === tableId,
    );
    if (summary) void openOrder(summary);
    else notify.error("No active order was found for this table.");
  }
  async function completeCurrentOrder() {
    if (!order) return;
    try {
      const completed = await client.completeOrder(order.id);
      setOrder(completed);
      await refresh();
      notify.success(
        `${String(completed.orderNumber).padStart(4, "0")} completed. Table is now available.`,
      );
    } catch (cause) {
      notify.error(
        cause instanceof Error
          ? cause.message
          : "Unable to complete this order.",
      );
    }
  }
  function startNewOrder() {
    setOrder(null);
    setOrderType("dine_in");
    setTableId(null);
    setCategory("All");
    setActiveScreen("POS");
  }
  async function savePrinter(input: Parameters<PosClient["savePrinter"]>[0]) {
    const saved = await client.savePrinter(input);
    setPrinters((current) => [
      ...current.filter((printer) => printer.id !== saved.id),
      saved,
    ]);
  }
  async function testPrinter(printerId: string) {
    await client.testPrinter(printerId);
  }
  async function retryPendingPrints() {
    const updatedOrders = await client.retryPendingKitchenPrints();
    const current = updatedOrders.find((entry) => entry.id === order?.id);
    if (current) setOrder(current);
    await refresh();
  }
  async function retryPendingReceiptPrints() {
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
    try {
      await action();
      await refreshInventory();
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to update inventory.",
      );
    }
  }
  async function tableAction(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
      notify.success("Table updated.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to update table.",
      );
      throw cause;
    }
  }
  const content =
    activeScreen === "POS" ? (
      <div className="flex min-h-0 flex-1 gap-6">
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
          onCompleteOrder={completeCurrentOrder}
        />
      </div>
    ) : (
      <div className="mx-auto max-w-6xl">
        {activeScreen === "Orders" && (
          <OrdersScreen
            orders={bootstrap?.openOrders ?? []}
            onOpenOrder={openOrder}
            onNewOrder={startNewOrder}
          />
        )}
        {activeScreen === "Tables" && (
          <TablesScreen
            tables={bootstrap?.tables ?? []}
            onCreate={(input) => tableAction(() => client.createTable(input))}
            onUpdate={(input) => tableAction(() => client.updateTable(input))}
            onReserve={(id, reserved) =>
              tableAction(() => client.setTableReservationState(id, reserved))
            }
            onStartOrder={startTableOrder}
            onOpenOrder={openTableOrder}
          />
        )}
        {activeScreen === "Menu" && menuManagement ? (
          <MenuScreen
            data={menuManagement}
            onCreate={(input) => saveMenuItem(input)}
            onUpdate={(input) => saveMenuItem(input)}
            onCreateCategory={createMenuCategory}
          />
        ) : null}
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
              printers
                .map((printer) => `${printer.role}:${printer.id}`)
                .join("|") || "no-printers"
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
        className={`min-h-0 flex-1 ${activeScreen === "POS" ? "flex flex-col overflow-hidden p-6" : "overflow-auto p-8"}`}
      >
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Badge tone="primary">{itemCount} items in current order</Badge>
        </div>
        {loading && !bootstrap ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Loading local restaurant data…
          </p>
        ) : null}
        {content}
      </div>
    </AppShell>
  );
}
