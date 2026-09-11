import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@ate05/ui";
import { notify } from "./lib/notifications";
import { AppShell } from "./components/app-shell";
import { MenuCatalog } from "./components/menu-catalog";
import { OrderPanel } from "./components/order-panel";
import { CheckoutWorkspace } from "./components/checkout-workspace";
import { type NavigationItem } from "./data";
import { getPosClient } from "./lib/get-pos-client";
import type {
  AuthBootstrap,
  OpenOrder,
  PosBootstrap,
  PosClient,
  PosOrder,
  PosPrinterConfig,
  BackupInfo,
  DatabaseHealth,
  SessionUser,
  AuthUser,
} from "./lib/pos-client";
import { formatGhs } from "./lib/pos-client";
import { TablesScreen } from "./screens/tables/tables-screen";
import { MenuScreen } from "./screens/menu/menu-screen";
import { InventoryScreen } from "./screens/inventory/inventory-screen";
import { SettingsScreen } from "./screens/settings/settings-screen";
import type { MenuManagementData } from "./lib/pos-client";
import { OrdersScreen } from "./screens/orders/orders-screen";
import { AuthScreen } from "./screens/auth-screen";
import { FirstRunSetupScreen } from "./screens/first-run-setup-screen";
import { KitchenScreen } from "./screens/kitchen/kitchen-screen";

const client = getPosClient();

export function App() {
  const [authBootstrap, setAuthBootstrap] = useState<AuthBootstrap | null>(
    null,
  );
  const [session, setSession] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rememberedStaffId, setRememberedStaffId] = useState<string | null>(
    null,
  );
  const [activeScreen, setActiveScreen] = useState<NavigationItem>("POS");
  const [bootstrap, setBootstrap] = useState<PosBootstrap | null>(null);
  const [printers, setPrinters] = useState<PosPrinterConfig[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [databaseHealth, setDatabaseHealth] = useState<DatabaseHealth | null>(
    null,
  );
  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [menuManagement, setMenuManagement] =
    useState<MenuManagementData | null>(null);
  const [order, setOrder] = useState<PosOrder | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [kitchenOrders, setKitchenOrders] = useState<PosOrder[]>([]);
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [loading, setLoading] = useState(true);
  const itemCount = useMemo(
    () => order?.items.reduce((total, line) => total + line.quantity, 0) ?? 0,
    [order],
  );
  const pendingPrints = useMemo(
    () =>
      (order?.kitchenTickets.filter(
        (ticket) => ticket.printStatus !== "printed",
      ).length ?? 0) +
      (order?.receipt && order.receipt.printStatus !== "printed" ? 1 : 0),
    [order],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        nextBootstrap,
        nextPrinters,
        nextMenu,
        nextBackups,
        nextHealth,
        nextStaff,
      ] = await Promise.all([
        client.bootstrap(),
        client.listPrinters(),
        client.listMenuManagement(),
        client.listBackups(),
        client.databaseHealth(),
        session?.permissions.includes("staff")
          ? client.listStaff()
          : Promise.resolve([]),
      ]);
      setBootstrap(nextBootstrap);
      setPrinters(nextPrinters);
      setMenuManagement(nextMenu);
      setBackups(nextBackups);
      setDatabaseHealth(nextHealth);
      setStaff(nextStaff);
    } catch (cause) {
      notify.error(
        cause instanceof Error
          ? cause.message
          : "Unable to load local restaurant data.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);
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
    void Promise.all([
      client.authBootstrap(),
      client.currentSession(),
      client.getRememberedStaffId(),
    ])
      .then(async ([nextAuth, current, remembered]) => {
        const validRemembered =
          remembered &&
          nextAuth.users.some(
            (user) => user.id === remembered && user.active && user.hasPin,
          )
            ? remembered
            : null;
        if (remembered && !validRemembered)
          await client.forgetRememberedStaff();
        setAuthBootstrap(nextAuth);
        setSession(current);
        setRememberedStaffId(validRemembered);
      })
      .catch((cause) =>
        notify.error(
          cause instanceof Error
            ? cause.message
            : "Unable to load staff sign-in.",
        ),
      )
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, session]);
  const refreshKitchen = useCallback(async () => {
    setKitchenLoading(true);
    try {
      setKitchenError(null);
      setKitchenOrders(await client.listKitchenOrders());
    } catch (cause) {
      setKitchenError(
        cause instanceof Error
          ? cause.message
          : "Unable to load kitchen tickets.",
      );
    } finally {
      setKitchenLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!session || activeScreen !== "Kitchen") return;
    const timer = window.setTimeout(() => void refreshKitchen(), 0);
    const onFocus = () => void refreshKitchen();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeScreen, refreshKitchen, session]);
  async function setupOwnerPin(userId: string, pin: string) {
    await client.setupOwnerPin(userId, pin);
    setAuthBootstrap(await client.authBootstrap());
  }
  async function completeFirstRunSetup(
    input: Parameters<PosClient["completeFirstRunSetup"]>[0],
  ) {
    await client.completeFirstRunSetup(input);
    const nextAuth = await client.authBootstrap();
    setAuthBootstrap(nextAuth);
    await signIn(input.ownerUserId, input.ownerPin);
    notify.success("Setup complete. Welcome to ATE05.");
  }
  async function saveSetupProgress(
    input: Parameters<PosClient["saveSetupProgress"]>[0],
  ) {
    await client.saveSetupProgress(input);
    setAuthBootstrap(await client.authBootstrap());
  }
  async function signIn(userId: string, pin: string) {
    const next = await client.authenticateUser(userId, pin);
    try {
      await client.rememberStaff(userId);
      setRememberedStaffId(userId);
    } catch {
      // Remembering identity is a convenience and must never block sign-in.
    }
    setSession(next);
    setActiveScreen("POS");
    return next;
  }
  async function lock() {
    await client.lockSession();
    setSession(null);
    setOrder(null);
    setCheckoutOpen(false);
  }
  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(() => void lock(), 5 * 60 * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void lock(), 5 * 60 * 1000);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [session]);
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
  async function advanceKitchenOrder(
    orderId: string,
    status: "preparing" | "ready",
  ) {
    try {
      await client.updateKitchenOrderStatus(orderId, status);
      await refreshKitchen();
      await refresh();
      notify.success(
        status === "ready" ? "Order marked ready." : "Order is now preparing.",
      );
    } catch (cause) {
      notify.error(
        cause instanceof Error
          ? cause.message
          : "Unable to update kitchen order.",
      );
      await refreshKitchen();
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
  ): Promise<PosOrder> {
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
      return updated;
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
      try {
        setOrder(await client.getOrder(input.orderId));
      } catch {
        // Keep the original payment error when reconciliation is unavailable.
      }
      throw cause;
    }
  }
  async function retryReceiptPrint() {
    if (!order) return;
    await client.retryReceiptPrint(order.id);
    const updated = await client.getOrder(order.id);
    setOrder(updated);
    await refresh();
    if (updated.receipt?.printStatus === "printed")
      notify.success("Receipt printed.");
    else notify.warning("Receipt is still waiting to print.");
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
      setCheckoutOpen(false);
      setActiveScreen("POS");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to reopen this order.",
      );
    }
  }
  function startTableOrder(tableId: string) {
    setOrder(null);
    setCheckoutOpen(false);
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
    setCheckoutOpen(false);
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
  async function createStaff(name: string, role: string, pin: string) {
    const created = await client.createStaff(name, role, pin);
    setStaff((current) => [...current, created]);
    notify.success("Staff member created.");
  }
  async function updateStaff(input: Parameters<PosClient["updateStaff"]>[0]) {
    await client.updateStaff(input);
    setStaff(await client.listStaff());
    notify.success("Staff member updated.");
  }
  async function testPrinter(printerId: string) {
    await client.testPrinter(printerId);
  }
  async function backupNow() {
    try {
      const created = await client.backupNow();
      setBackups(await client.listBackups());
      notify.success(
        `Backup created · ${new Date(created.createdAt * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
      );
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to create backup.",
      );
      throw cause;
    }
  }
  async function exportBackup() {
    try {
      const path = await client.exportBackup();
      if (path) notify.success("Backup exported successfully.");
      return path;
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to export backup.",
      );
      throw cause;
    }
  }
  async function restoreBackup(fileName: string) {
    try {
      await client.restoreBackup(fileName);
      setOrder(null);
      await refresh();
      notify.success("Backup restored. Local data has been reloaded.");
    } catch (cause) {
      notify.error(
        cause instanceof Error ? cause.message : "Unable to restore backup.",
      );
      throw cause;
    }
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
      checkoutOpen && order ? (
        <CheckoutWorkspace
          order={order}
          businessName={authBootstrap?.businessName || "ATE05"}
          cashierName={session?.name ?? ""}
          onBack={() => setCheckoutOpen(false)}
          onRecordPayment={recordPayment}
          onRetryReceiptPrint={retryReceiptPrint}
          onReprintReceipt={reprintReceipt}
          onCompleteOrder={completeCurrentOrder}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
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
            onOpenCheckout={() => setCheckoutOpen(true)}
            onCompleteOrder={completeCurrentOrder}
          />
        </div>
      )
    ) : (
      <div className={activeScreen === "Kitchen" ? "h-full min-h-0" : ""}>
        {activeScreen === "Orders" && (
          <OrdersScreen
            orders={bootstrap?.openOrders ?? []}
            onOpenOrder={openOrder}
            onNewOrder={startNewOrder}
          />
        )}
        {activeScreen === "Kitchen" && (
          <KitchenScreen
            orders={kitchenOrders}
            loading={kitchenLoading}
            error={kitchenError}
            onRefresh={refreshKitchen}
            onAdvance={advanceKitchenOrder}
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
            backups={backups}
            databaseHealth={databaseHealth}
            onBackupNow={backupNow}
            onExportBackup={exportBackup}
            onRestoreBackup={restoreBackup}
            staff={staff}
            onCreateStaff={createStaff}
            onUpdateStaff={updateStaff}
          />
        )}
      </div>
    );
  if (authLoading || !authBootstrap)
    return (
      <main className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading ATE05…
      </main>
    );
  if (!session && authBootstrap.setupRequired)
    return (
      <FirstRunSetupScreen
        bootstrap={authBootstrap}
        onProgress={saveSetupProgress}
        onComplete={completeFirstRunSetup}
      />
    );
  if (!session)
    return (
      <AuthScreen
        bootstrap={authBootstrap}
        rememberedStaffId={rememberedStaffId}
        onForgetRemembered={async () => {
          await client.forgetRememberedStaff();
          setRememberedStaffId(null);
        }}
        onLogin={signIn}
        onSetupPin={setupOwnerPin}
      />
    );
  return (
    <AppShell
      active={activeScreen}
      onNavigate={setActiveScreen}
      session={session}
      onLock={() => void lock()}
      businessName={authBootstrap.businessName}
      databaseHealthy={databaseHealth?.healthy ?? true}
      pendingPrints={pendingPrints}
      canOpenSettings={session.permissions.includes("settings")}
    >
      <div
        className={`min-h-0 flex-1 ${activeScreen === "POS" ? "flex flex-col overflow-hidden p-4 xl:p-6" : activeScreen === "Kitchen" ? "overflow-hidden p-4 xl:p-6" : "overflow-auto p-8"}`}
      >
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Badge tone="primary">{itemCount} items in current order</Badge>
        </div>
        {loading && !bootstrap ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Loading local restaurant data…
          </p>
        ) : null}
        <div
          className={
            activeScreen === "POS"
              ? "flex h-full min-h-0 w-full flex-col"
              : activeScreen === "Kitchen"
                ? "mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col"
                : "mx-auto max-w-6xl"
          }
        >
          {content}
        </div>
      </div>
    </AppShell>
  );
}
