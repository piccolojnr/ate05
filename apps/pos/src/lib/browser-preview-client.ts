import type {
  KitchenTicket,
  InventoryItem,
  MenuCategory,
  MenuItem,
  MenuManagementData,
  MenuManagementItem,
  PosBootstrap,
  BackupInfo,
  DatabaseHealth,
  AuthBootstrap,
  AuthUser,
  SessionUser,
  PosClient,
  PosOrder,
  PosPayment,
  PosPrinterConfig,
  RestaurantTable,
  StockMovement,
} from "./pos-client";
import type { PaperWidth } from "@ate05/printing";
import { calculateKitchenDeltas, type KitchenSyncLine } from "@ate05/domain";
import { PosClientError } from "./client-errors";

const storageKey = "ate05-pos-browser-preview-v1";
const businessId = "00000000-0000-4000-8000-000000000001";
const createdBy = "00000000-0000-4000-8000-000000000002";
const rememberedStaffKey = "ate05-pos-browser-remembered-staff-v1";
const staffKey = "ate05-pos-browser-staff-v1";

interface PreviewState {
  nextOrderNumber: number;
  nextReceiptNumber: number;
  orders: PosOrder[];
  printers: PosPrinterConfig[];
  tables?: RestaurantTable[];
  inventory: InventoryItem[];
  movements: StockMovement[];
  menuCategories?: Array<MenuCategory & { active: boolean; updatedAt: string }>;
  menuItems?: Array<
    MenuItem & { available: boolean; active: boolean; updatedAt: string }
  >;
}

const categories: MenuCategory[] = [
  { id: "00000000-0000-4000-8000-000000000010", name: "Rice", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000011", name: "Drinks", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000012", name: "Sides", sortOrder: 3 },
];
const items: MenuItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000020",
    categoryId: categories[0]!.id,
    name: "Fried Rice",
    description: null,
    sellingPriceMinor: 5000,
  },
  {
    id: "00000000-0000-4000-8000-000000000021",
    categoryId: categories[0]!.id,
    name: "Jollof Rice",
    description: null,
    sellingPriceMinor: 4500,
  },
  {
    id: "00000000-0000-4000-8000-000000000022",
    categoryId: categories[2]!.id,
    name: "Chicken Wings",
    description: null,
    sellingPriceMinor: 3500,
  },
  {
    id: "00000000-0000-4000-8000-000000000023",
    categoryId: categories[1]!.id,
    name: "Coke",
    description: null,
    sellingPriceMinor: 1200,
  },
];
const tables: RestaurantTable[] = [1, 2, 3, 4].map((number) => ({
  id: `00000000-0000-4000-8000-00000000003${number - 1}`,
  name: `Table ${number}`,
  capacity: 4,
  active: true,
  status: "available",
}));

function readState(): PreviewState {
  const raw = window.localStorage.getItem(storageKey);
  const state = raw
    ? (JSON.parse(raw) as PreviewState)
    : {
        nextOrderNumber: 1,
        nextReceiptNumber: 1,
        orders: [],
        printers: [],
        inventory: [],
        movements: [],
      };
  state.nextReceiptNumber ??= 1;
  state.printers ??= [];
  state.tables ??= tables;
  state.inventory ??= [];
  state.movements ??= [];
  state.menuCategories ??= categories.map((category) => ({
    ...category,
    active: true,
    updatedAt: new Date().toISOString(),
  }));
  state.menuItems ??= items.map((item) => ({
    ...item,
    available: true,
    active: true,
    updatedAt: new Date().toISOString(),
  }));
  for (const order of state.orders) {
    order.amountPaidMinor ??=
      order.receipt?.payments.reduce(
        (sum, payment) => sum + payment.amountMinor,
        0,
      ) ?? 0;
    order.amountDueMinor ??= Math.max(
      0,
      order.totalMinor - order.amountPaidMinor,
    );
    order.receipt ??= null;
    order.kitchenTickets ??= [];
    for (const ticket of order.kitchenTickets) {
      ticket.lastPrintError ??= null;
      ticket.printAttemptCount ??= 0;
      ticket.lastAttemptAt ??= null;
    }
    order.kitchenChangesPending ??= false;
  }
  return state;
}
function inventoryState(
  quantity: number,
  threshold: number | null,
): InventoryItem["stockState"] {
  if (quantity === 0) return "out_of_stock";
  if (threshold !== null && quantity <= threshold) return "low_stock";
  return "in_stock";
}
function refreshInventory(item: InventoryItem): InventoryItem {
  return {
    ...item,
    stockState: inventoryState(item.currentQuantity, item.reorderThreshold),
  };
}
function writeState(state: PreviewState): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}
function refreshOrder(order: PosOrder): PosOrder {
  const subtotalMinor = order.items.reduce(
    (total, item) => total + item.lineTotalMinor,
    0,
  );
  const amountPaidMinor =
    order.receipt?.payments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0,
    ) ?? 0;
  return {
    ...order,
    subtotalMinor,
    totalMinor: subtotalMinor,
    amountPaidMinor,
    amountDueMinor: Math.max(0, subtotalMinor - amountPaidMinor),
  };
}

function kitchenSyncLines(order: PosOrder): KitchenSyncLine[] {
  const sent = new Map<
    string,
    { quantity: number; notes: string | null; itemName: string }
  >();
  for (const ticket of order.kitchenTickets) {
    for (const item of ticket.items) {
      if (!item.orderItemId) continue;
      const previous = sent.get(item.orderItemId) ?? {
        quantity: 0,
        notes: null,
        itemName: item.itemName,
      };
      previous.quantity +=
        item.action === "add" ? item.quantity : -item.quantity;
      if (item.action === "add") {
        previous.notes = item.notes;
        previous.itemName = item.itemName;
      }
      sent.set(item.orderItemId, previous);
    }
  }
  const lines = order.items.map((item) => {
    const previous = sent.get(item.id);
    return {
      orderItemId: item.id,
      itemName: item.name,
      quantity: item.quantity,
      notes: item.notes,
      sentQuantity: previous?.quantity ?? 0,
      sentNotes: previous?.notes ?? null,
    };
  });
  for (const [orderItemId, previous] of sent) {
    if (order.items.some((item) => item.id === orderItemId)) continue;
    lines.push({
      orderItemId,
      itemName: previous.itemName,
      quantity: 0,
      notes: null,
      sentQuantity: previous.quantity,
      sentNotes: previous.notes,
    });
  }
  return lines;
}

function updateKitchenPending(order: PosOrder): PosOrder {
  return {
    ...order,
    kitchenChangesPending:
      calculateKitchenDeltas(
        kitchenSyncLines(order),
        order.kitchenTickets.length > 0,
      ).length > 0,
  };
}

/** Browser-only preview adapter. Desktop uses the explicit Tauri command client. */
export function createBrowserPreviewClient(): PosClient {
  let session: SessionUser | null = null;
  let ownerPin = "2468";
  const defaultUsers: AuthUser[] = [
    {
      id: createdBy,
      name: "ATE05 Owner",
      role: "owner",
      active: true,
      hasPin: true,
    },
    {
      id: "preview-cashier",
      name: "Preview Cashier",
      role: "cashier",
      active: true,
      hasPin: true,
    },
  ];
  type StoredStaff = AuthUser & { pin: string };
  const previewUsers: StoredStaff[] = (() => {
    try {
      const stored = window.localStorage.getItem(staffKey);
      if (stored) return JSON.parse(stored) as StoredStaff[];
    } catch {
      // Continue with development accounts when preview storage is unavailable.
    }
    return defaultUsers.map((user) => ({
      ...user,
      pin: user.role === "owner" ? ownerPin : "1357",
    }));
  })();
  const persistStaff = () => {
    try {
      window.localStorage.setItem(staffKey, JSON.stringify(previewUsers));
    } catch {
      // Current-session changes remain usable when storage is unavailable.
    }
  };
  const publicStaff = (): AuthUser[] =>
    previewUsers.map(({ id, name, role, active, hasPin }) => ({
      id,
      name,
      role,
      active,
      hasPin,
    }));
  const previewPermissions = (role: string) =>
    role === "owner"
      ? [
          "pos",
          "orders",
          "tables",
          "menu",
          "inventory",
          "settings",
          "kitchen",
          "staff",
          "printers",
          "backup",
          "inventory_adjustment",
        ]
      : role === "kitchen"
        ? ["pos", "orders", "kitchen", "inventory"]
        : ["pos", "orders", "tables"];
  const requirePermission = (permission: string) => {
    if (!session) throw new Error("Please sign in again.");
    if (!session.permissions.includes(permission))
      throw new Error("You do not have permission to perform this action.");
  };
  const actorId = () => session?.id ?? createdBy;
  function applyMovement(
    state: PreviewState,
    itemId: string,
    type: StockMovement["type"],
    delta: number,
    reason: string | null,
  ): InventoryItem {
    const item = state.inventory.find((entry) => entry.id === itemId);
    if (!item) throw new Error("Inventory item not found.");
    if (!item.active) throw new Error("Inventory item is inactive.");
    const next = item.currentQuantity + delta;
    if (next < 0)
      throw new Error(
        "Only " + item.currentQuantity + " " + item.unit + " is available.",
      );
    if ((type === "waste" || type === "adjustment") && !reason?.trim())
      throw new Error("A reason is required for this movement.");
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      inventoryItemId: itemId,
      type,
      quantityDelta: delta,
      balanceAfter: next,
      reason: reason?.trim() || null,
      createdBy: actorId(),
      createdAt: new Date().toISOString(),
    };
    item.currentQuantity = next;
    state.movements.unshift(movement);
    return refreshInventory(item);
  }
  return {
    async authBootstrap(): Promise<AuthBootstrap> {
      return {
        users: publicStaff(),
        requiresOwnerPin: false,
        setupRequired: false,
        businessName: "ATE05",
        setupStep: 0,
        setupBusinessName: null,
        setupOwnerName: null,
        setupStarterPack: null,
        setupTableCount: null,
      };
    },
    async setupOwnerPin(_userId, pin) {
      if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4 to 6 digits.");
      ownerPin = pin;
      const owner = previewUsers.find((user) => user.role === "owner");
      if (owner) owner.pin = pin;
      persistStaff();
    },
    async saveSetupProgress() {},
    async completeFirstRunSetup(input) {
      if (!input.businessName.trim())
        throw new Error("Restaurant name is required.");
      if (!/^\d{4,6}$/.test(input.ownerPin))
        throw new Error("PIN must be 4 to 6 digits.");
      ownerPin = input.ownerPin;
    },
    async authenticateUser(userId, pin) {
      const user = previewUsers.find((entry) => entry.id === userId);
      const valid = user && pin === user.pin;
      if (!user?.active)
        throw new PosClientError("inactive_staff", "This account is inactive.");
      if (!valid) throw new PosClientError("invalid_pin", "Incorrect PIN.");
      session = {
        id: user.id,
        businessId,
        name: user.name,
        role: user.role,
        permissions: previewPermissions(user.role),
      };
      return session;
    },
    async currentSession() {
      return session;
    },
    async lockSession() {
      session = null;
    },
    async getRememberedStaffId() {
      try {
        return window.localStorage.getItem(rememberedStaffKey);
      } catch {
        return null;
      }
    },
    async rememberStaff(userId) {
      try {
        window.localStorage.setItem(rememberedStaffKey, userId);
      } catch {
        // Remembering identity is a convenience; authentication remains valid.
      }
    },
    async forgetRememberedStaff() {
      try {
        window.localStorage.removeItem(rememberedStaffKey);
      } catch {
        // Corrupt/unavailable preview storage is treated as empty.
      }
    },
    async listStaff() {
      if (!session?.permissions.includes("staff"))
        throw new Error(
          "Staff management is available to administrators only.",
        );
      return publicStaff();
    },
    async createStaff(name, role, pin) {
      if (!session?.permissions.includes("staff"))
        throw new Error("You do not have permission to perform this action.");
      if (!name.trim()) throw new Error("Staff name is required.");
      if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4 to 6 digits.");
      const user: StoredStaff = {
        id: crypto.randomUUID(),
        name: name.trim(),
        role,
        active: true,
        hasPin: true,
        pin,
      };
      previewUsers.push(user);
      persistStaff();
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        active: user.active,
        hasPin: user.hasPin,
      };
    },
    async updateStaff(input) {
      if (!session?.permissions.includes("staff"))
        throw new Error("You do not have permission to perform this action.");
      const user = previewUsers.find((entry) => entry.id === input.userId);
      if (!user) throw new Error("Staff member not found.");
      user.name = input.name.trim();
      user.role = input.role;
      user.active = input.active;
      if (input.pin !== undefined) {
        if (!/^\d{4,6}$/.test(input.pin))
          throw new Error("PIN must be 4 to 6 digits.");
        user.pin = input.pin;
      }
      persistStaff();
    },
    async bootstrap(): Promise<PosBootstrap> {
      const state = readState();
      const menuCategories = state.menuCategories!;
      const menuItems = state.menuItems!;
      const occupied = new Set(
        state.orders
          .filter(
            (order) =>
              order.orderType === "dine_in" &&
              ["open", "sent_to_kitchen", "preparing", "ready"].includes(
                order.status,
              ),
          )
          .map((order) => order.tableId),
      );
      return {
        businessId,
        createdBy: actorId(),
        categories: menuCategories.filter((category) => category.active),
        items: menuItems.filter(
          (item) =>
            item.active &&
            item.available &&
            menuCategories.some(
              (category) => category.id === item.categoryId && category.active,
            ),
        ),
        tables: state.tables!.map((table) => ({
          ...table,
          status: occupied.has(table.id) ? "occupied" : table.status,
        })),
        openOrders: state.orders
          .filter((order) =>
            [
              "open",
              "sent_to_kitchen",
              "preparing",
              "ready",
              "completed",
            ].includes(order.status),
          )
          .map((order) => ({
            id: order.id,
            businessId: order.businessId,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            tableId: order.tableId,
            tableName: order.tableName,
            status: order.status,
            paymentStatus: order.paymentStatus,
            subtotalMinor: order.subtotalMinor,
            totalMinor: order.totalMinor,
            amountPaidMinor: order.amountPaidMinor,
            amountDueMinor: order.amountDueMinor,
            receipt: order.receipt,
            openedAt: order.openedAt,
          })),
        inventory: state.inventory.map(refreshInventory),
      };
    },
    async listMenuManagement(): Promise<MenuManagementData> {
      const state = readState();
      return {
        categories: state.menuCategories!.map(
          ({ id, name, sortOrder, active }) => ({
            id,
            name,
            sortOrder,
            active,
          }),
        ),
        items: state.menuItems!.map((item) => ({
          ...item,
          categoryName:
            state.menuCategories!.find(
              (category) => category.id === item.categoryId,
            )?.name ?? "Unknown",
        })),
      };
    },
    async createMenuItem(input) {
      requirePermission("menu");
      if (!input.name.trim()) throw new Error("Menu item name is required.");
      if (
        !Number.isSafeInteger(input.sellingPriceMinor) ||
        input.sellingPriceMinor < 0
      )
        throw new Error("Price must be a valid non-negative amount.");
      const state = readState();
      const category = state.menuCategories!.find(
        (entry) => entry.id === input.categoryId && entry.active,
      );
      if (!category) throw new Error("The selected category is unavailable.");
      const item = {
        id: crypto.randomUUID(),
        categoryId: input.categoryId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        sellingPriceMinor: input.sellingPriceMinor,
        available: input.available,
        active: input.active,
        updatedAt: new Date().toISOString(),
      };
      state.menuItems!.push(item);
      writeState(state);
      return { ...item, categoryName: category.name } as MenuManagementItem;
    },
    async updateMenuItem(input) {
      requirePermission("menu");
      if (!input.name.trim()) throw new Error("Menu item name is required.");
      if (
        !Number.isSafeInteger(input.sellingPriceMinor) ||
        input.sellingPriceMinor < 0
      )
        throw new Error("Price must be a valid non-negative amount.");
      const state = readState();
      const item = state.menuItems!.find((entry) => entry.id === input.id);
      const category = state.menuCategories!.find(
        (entry) => entry.id === input.categoryId && entry.active,
      );
      if (!item) throw new Error("Menu item not found.");
      if (!category) throw new Error("The selected category is unavailable.");
      Object.assign(item, {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        categoryId: input.categoryId,
        sellingPriceMinor: input.sellingPriceMinor,
        available: input.available,
        active: input.active,
        updatedAt: new Date().toISOString(),
      });
      writeState(state);
      return { ...item, categoryName: category.name } as MenuManagementItem;
    },
    async createMenuCategory(name) {
      requirePermission("menu");
      if (!name.trim()) throw new Error("Category name is required.");
      const state = readState();
      const category = {
        id: crypto.randomUUID(),
        name: name.trim(),
        sortOrder: state.menuCategories!.length + 1,
        active: true,
        updatedAt: new Date().toISOString(),
      };
      state.menuCategories!.push(category);
      writeState(state);
      return category;
    },
    async updateMenuCategory(input) {
      requirePermission("menu");
      const state = readState();
      const category = state.menuCategories!.find(
        (entry) => entry.id === input.id,
      );
      if (!category) throw new Error("Category not found.");
      if (
        !input.active &&
        state.menuItems!.some(
          (item) => item.categoryId === input.id && item.active,
        )
      )
        throw new Error(
          "Deactivate or reassign active items before disabling this category.",
        );
      Object.assign(category, {
        name: input.name.trim(),
        active: input.active,
        updatedAt: new Date().toISOString(),
      });
      writeState(state);
      return category;
    },
    async createTable(input) {
      requirePermission("tables");
      const name = input.name.trim();
      if (!name) throw new Error("Table name is required.");
      const capacity = input.capacity ?? 4;
      if (!Number.isSafeInteger(capacity) || capacity <= 0)
        throw new Error("Table capacity must be a positive whole number.");
      const state = readState();
      if (
        state.tables!.some(
          (table) => table.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new Error("A table with this name already exists.");
      const table: RestaurantTable = {
        id: crypto.randomUUID(),
        name,
        capacity,
        active: input.active !== false,
        status: "available",
      };
      state.tables!.push(table);
      writeState(state);
      return table;
    },
    async updateTable(input) {
      requirePermission("tables");
      const state = readState();
      const table = state.tables!.find((entry) => entry.id === input.id);
      if (!table) throw new Error("Table not found.");
      const name = input.name.trim();
      if (!name) throw new Error("Table name is required.");
      if (
        state.tables!.some(
          (entry) =>
            entry.id !== input.id &&
            entry.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new Error("A table with this name already exists.");
      if (
        !input.active &&
        state.orders.some(
          (order) =>
            order.tableId === input.id &&
            ["open", "sent_to_kitchen", "preparing", "ready"].includes(
              order.status,
            ),
        )
      )
        throw new Error(
          "Complete the active order before deactivating this table.",
        );
      Object.assign(table, {
        name,
        capacity: input.capacity ?? table.capacity,
        active: input.active,
      });
      writeState(state);
      return table;
    },
    async setTableReservationState(tableId, reserved) {
      requirePermission("tables");
      const state = readState();
      const table = state.tables!.find((entry) => entry.id === tableId);
      if (!table || !table.active) throw new Error("Table is unavailable.");
      if (
        state.orders.some(
          (order) =>
            order.tableId === tableId &&
            ["open", "sent_to_kitchen", "preparing", "ready"].includes(
              order.status,
            ),
        )
      )
        throw new Error("Table already has an active order.");
      table.status = reserved ? "reserved" : "available";
      writeState(state);
      return table;
    },
    async completeOrder(orderId) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found.");
      if (
        !["open", "sent_to_kitchen", "preparing", "ready"].includes(
          order.status,
        )
      )
        throw new Error("Only an active order can be completed.");
      order.status = "completed";
      if (
        order.tableId &&
        !state.orders.some(
          (entry) =>
            entry.id !== order.id &&
            entry.tableId === order.tableId &&
            ["open", "sent_to_kitchen", "preparing", "ready"].includes(
              entry.status,
            ),
        )
      ) {
        const table = state.tables!.find((entry) => entry.id === order.tableId);
        if (table) table.status = "available";
      }
      writeState(state);
      return order;
    },
    async addMenuItem(input) {
      const state = readState();
      const menuItem = state.menuItems!.find(
        (item) => item.id === input.menuItemId && item.active && item.available,
      );
      if (!menuItem) throw new Error("This menu item is unavailable.");
      let order = input.orderId
        ? state.orders.find((entry) => entry.id === input.orderId)
        : undefined;
      if (!order) {
        if (input.orderType === "dine_in" && !input.tableId)
          throw new Error("Select a table for a dine-in order.");
        if (input.tableId) {
          const table = state.tables!.find(
            (entry) => entry.id === input.tableId && entry.active,
          );
          if (!table) throw new Error("The selected table is unavailable.");
          if (
            state.orders.some(
              (entry) =>
                entry.tableId === input.tableId &&
                ["open", "sent_to_kitchen", "preparing", "ready"].includes(
                  entry.status,
                ),
            )
          )
            throw new Error("This table already has an active order.");
        }
        order = {
          id: crypto.randomUUID(),
          businessId,
          orderNumber: state.nextOrderNumber++,
          orderType: input.orderType,
          tableId:
            input.orderType === "takeaway" ? null : (input.tableId ?? null),
          tableName:
            state.tables!.find((table) => table.id === input.tableId)?.name ??
            null,
          status: "open",
          paymentStatus: "unpaid",
          subtotalMinor: 0,
          totalMinor: 0,
          amountPaidMinor: 0,
          amountDueMinor: 0,
          receipt: null,
          openedAt: new Date().toISOString(),
          items: [],
          kitchenTickets: [],
          kitchenChangesPending: false,
        };
        state.orders.push(order);
        if (order.tableId) {
          const table = state.tables!.find(
            (entry) => entry.id === order!.tableId,
          );
          if (table) table.status = "occupied";
        }
      }
      if (!["open", "sent_to_kitchen", "preparing"].includes(order.status))
        throw new Error("This order can no longer be changed.");
      const existing = order.items.find(
        (item) => item.menuItemId === menuItem.id && !item.notes,
      );
      if (existing) {
        existing.quantity += 1;
        existing.lineTotalMinor = existing.unitPriceMinor * existing.quantity;
      } else
        order.items.push({
          id: crypto.randomUUID(),
          menuItemId: menuItem.id,
          name: menuItem.name,
          unitPriceMinor: menuItem.sellingPriceMinor,
          quantity: 1,
          lineTotalMinor: menuItem.sellingPriceMinor,
          notes: null,
        });
      order = refreshOrder(order);
      state.orders = state.orders.map((entry) =>
        entry.id === order!.id ? order! : entry,
      );
      writeState(state);
      return updateKitchenPending(order);
    },
    async getOrder(orderId) {
      const order = readState().orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found.");
      return order;
    },
    async updateOrderItemQuantity(orderId, itemId, quantity) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (
        !order ||
        !["open", "sent_to_kitchen", "preparing"].includes(order.status) ||
        quantity < 0
      )
        throw new Error("Order item is unavailable.");
      order.items =
        quantity === 0
          ? order.items.filter((item) => item.id !== itemId)
          : order.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    quantity,
                    lineTotalMinor: item.unitPriceMinor * quantity,
                  }
                : item,
            );
      const updated = refreshOrder(order);
      const result = updateKitchenPending(updated);
      state.orders = state.orders.map((entry) =>
        entry.id === orderId ? result : entry,
      );
      writeState(state);
      return result;
    },
    async updateOrderItemNote(orderId, itemId, notes) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (
        !order ||
        !["open", "sent_to_kitchen", "preparing"].includes(order.status)
      )
        throw new Error("Order item is unavailable.");
      order.items = order.items.map((item) =>
        item.id === itemId ? { ...item, notes: notes.trim() || null } : item,
      );
      const result = updateKitchenPending(order);
      state.orders = state.orders.map((entry) =>
        entry.id === orderId ? result : entry,
      );
      writeState(state);
      return result;
    },
    async removeOrderItem(orderId, itemId) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (
        !order ||
        !["open", "sent_to_kitchen", "preparing"].includes(order.status)
      )
        throw new Error("Order not found.");
      const updated = refreshOrder({
        ...order,
        items: order.items.filter((item) => item.id !== itemId),
      });
      const result = updateKitchenPending(updated);
      state.orders = state.orders.map((entry) =>
        entry.id === orderId ? result : entry,
      );
      writeState(state);
      return result;
    },
    async sendOrderToKitchen(orderId) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found.");
      if (!["open", "sent_to_kitchen", "preparing"].includes(order.status))
        throw new Error("Only an active order can be sent to the kitchen.");
      const deltas = calculateKitchenDeltas(
        kitchenSyncLines(order),
        order.kitchenTickets.length > 0,
      );
      let sequence = order.kitchenTickets.length + 1;
      const createdAt = new Date().toISOString();
      const tickets: KitchenTicket[] = deltas.map((delta) => ({
        id: crypto.randomUUID(),
        sequence: sequence++,
        type: delta.type,
        printStatus: "pending",
        printedAt: null,
        createdAt,
        lastPrintError: null,
        printAttemptCount: 0,
        lastAttemptAt: null,
        items: delta.items.map((item) => ({
          id: crypto.randomUUID(),
          orderItemId: item.orderItemId,
          itemName: item.itemName,
          quantity: item.quantity,
          action: item.action,
          notes: item.notes,
        })),
      }));
      const updated = updateKitchenPending({
        ...order,
        status:
          deltas.length > 0 && order.status === "open"
            ? "sent_to_kitchen"
            : order.status,
        kitchenTickets: [...order.kitchenTickets, ...tickets],
      });
      state.orders = state.orders.map((entry) =>
        entry.id === orderId ? updated : entry,
      );
      writeState(state);
      return updated;
    },
    async listKitchenOrders() {
      requirePermission("kitchen");
      return readState()
        .orders.filter(
          (order) =>
            ["sent_to_kitchen", "preparing", "ready"].includes(order.status) &&
            order.kitchenTickets.length > 0,
        )
        .sort((a, b) =>
          `${a.openedAt}:${a.orderNumber}`.localeCompare(
            `${b.openedAt}:${b.orderNumber}`,
          ),
        );
    },
    async updateKitchenOrderStatus(orderId, status) {
      requirePermission("kitchen");
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order)
        throw new PosClientError("not_found", "Kitchen order not found.");
      const valid =
        (order.status === "sent_to_kitchen" && status === "preparing") ||
        (order.status === "preparing" && status === "ready");
      if (!valid)
        throw new PosClientError(
          "invalid_state",
          "This kitchen order has already moved to another stage.",
        );
      order.status = status;
      writeState(state);
      return order;
    },
    async listPrinters() {
      return readState().printers;
    },
    async savePrinter(input) {
      requirePermission("printers");
      const state = readState();
      const printer: PosPrinterConfig = {
        id: input.id ?? crypto.randomUUID(),
        businessId,
        name: input.name.trim(),
        role: input.role ?? "kitchen",
        connectionType: input.connectionType,
        address: input.address.trim(),
        port: input.port,
        paperWidth: input.paperWidth as PaperWidth,
        cutterEnabled: input.cutterEnabled,
        active: input.active,
      };
      state.printers = [
        ...state.printers.filter((entry) => entry.id !== printer.id),
        printer,
      ];
      writeState(state);
      return printer;
    },
    async testPrinter(printerId) {
      if (!readState().printers.some((printer) => printer.id === printerId))
        throw new Error("Printer not found.");
    },
    async retryPendingKitchenPrints() {
      return readState().orders.filter((order) =>
        order.kitchenTickets.some((ticket) => ticket.printStatus !== "printed"),
      );
    },
    async reprintKitchenTicket(orderId, ticketId) {
      const order = readState().orders.find((entry) => entry.id === orderId);
      if (
        !order ||
        !order.kitchenTickets.some((ticket) => ticket.id === ticketId)
      )
        throw new Error("Kitchen ticket not found.");
    },
    async recordPayment(input) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === input.orderId);
      if (!order) throw new Error("Order not found.");
      order.receipt ??= null;
      const existingPayment = order.receipt?.payments.find(
        (payment) => payment.id === input.idempotencyKey,
      );
      if (existingPayment) return order;
      const paid = order.amountPaidMinor;
      const due = Math.max(0, order.totalMinor - paid);
      if (input.amountMinor <= 0 || input.amountMinor > due)
        throw new Error("Payment amount is invalid.");
      const tendered =
        input.method === "cash"
          ? (input.cashTenderedMinor ?? input.amountMinor)
          : null;
      if (tendered !== null && tendered < input.amountMinor)
        throw new Error("Cash tendered must cover the payment.");
      const payment: PosPayment = {
        id: input.idempotencyKey,
        amountMinor: input.amountMinor,
        method: input.method,
        reference: input.reference?.trim() || null,
        cashTenderedMinor: tendered,
        changeMinor: tendered === null ? null : tendered - input.amountMinor,
      };
      const payments = [...(order.receipt?.payments ?? []), payment];
      const amountPaidMinor = paid + input.amountMinor;
      order.amountPaidMinor = amountPaidMinor;
      order.amountDueMinor = Math.max(0, order.totalMinor - amountPaidMinor);
      order.paymentStatus =
        order.amountDueMinor === 0 ? "paid" : "partially_paid";
      if (order.amountDueMinor === 0) {
        order.receipt = {
          id: order.receipt?.id ?? crypto.randomUUID(),
          receiptNumber:
            order.receipt?.receiptNumber ?? state.nextReceiptNumber++,
          totalMinor: order.totalMinor,
          issuedAt: new Date().toISOString(),
          printStatus: "printed",
          printedAt: new Date().toISOString(),
          lastPrintError: null,
          payments,
          items: order.items.map((item) => ({ ...item })),
        };
      } else if (order.receipt) {
        order.receipt.payments = payments;
      }
      state.orders = state.orders.map((entry) =>
        entry.id === order.id ? order : entry,
      );
      writeState(state);
      return order;
    },
    async listReceipts() {
      return readState().orders.flatMap((entry) =>
        entry.receipt ? [entry.receipt] : [],
      );
    },
    async retryPendingReceiptPrints() {
      return readState().orders.filter(
        (entry) => entry.receipt?.printStatus !== "printed",
      );
    },
    async retryReceiptPrint(orderId) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order?.receipt) throw new Error("Receipt not found.");
      order.receipt = {
        ...order.receipt,
        printStatus: "printed",
        printedAt: new Date().toISOString(),
        lastPrintError: null,
      };
      state.orders = state.orders.map((entry) =>
        entry.id === order.id ? order : entry,
      );
      writeState(state);
    },
    async reprintReceipt(orderId) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order?.receipt) throw new Error("Receipt not found.");
      order.receipt = {
        ...order.receipt,
        printStatus: "printed",
        printedAt: new Date().toISOString(),
        lastPrintError: null,
      };
      state.orders = state.orders.map((entry) =>
        entry.id === order.id ? order : entry,
      );
      writeState(state);
    },
    async listBackups(): Promise<BackupInfo[]> {
      return [];
    },
    async backupNow(): Promise<BackupInfo> {
      requirePermission("backup");
      throw new Error("Backups are available in the native desktop app only.");
    },
    async exportBackup(): Promise<string | null> {
      requirePermission("backup");
      throw new Error(
        "Backup export is available in the native desktop app only.",
      );
    },
    async databaseHealth(): Promise<DatabaseHealth> {
      return {
        healthy: true,
        schemaVersion: 0,
        message: "Browser preview does not use the production SQLite database.",
      };
    },
    async restoreBackup(): Promise<BackupInfo> {
      requirePermission("backup");
      throw new Error("Restore is available in the native desktop app only.");
    },
    async listInventory() {
      return readState().inventory.map(refreshInventory);
    },
    async getInventoryItem(itemId) {
      const item = readState().inventory.find((entry) => entry.id === itemId);
      if (!item) throw new Error("Inventory item not found.");
      return refreshInventory(item);
    },
    async listStockMovements(itemId) {
      return readState().movements.filter(
        (movement) => movement.inventoryItemId === itemId,
      );
    },
    async createInventoryItem(input) {
      requirePermission("inventory");
      const state = readState();
      if (!input.name.trim())
        throw new Error("Inventory item name is required.");
      if (
        !Number.isSafeInteger(input.startingQuantity) ||
        input.startingQuantity < 0
      )
        throw new Error(
          "Starting quantity must be a non-negative whole number.",
        );
      const item: InventoryItem = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        unit: input.unit,
        currentQuantity: 0,
        reorderThreshold: input.reorderThreshold,
        active: true,
        stockState: "out_of_stock",
      };
      state.inventory.push(item);
      if (input.startingQuantity > 0)
        applyMovement(
          state,
          item.id,
          "purchase",
          input.startingQuantity,
          "Opening balance",
        );
      writeState(state);
      return refreshInventory(item);
    },
    async updateInventoryItem(input) {
      requirePermission("inventory");
      const state = readState();
      const item = state.inventory.find((entry) => entry.id === input.id);
      if (!item) throw new Error("Inventory item not found.");
      if (
        item.unit !== input.unit &&
        state.movements.some((movement) => movement.inventoryItemId === item.id)
      )
        throw new Error(
          "Unit cannot change after stock movement history exists.",
        );
      item.name = input.name.trim();
      item.unit = input.unit;
      item.reorderThreshold = input.reorderThreshold;
      item.active = input.active;
      writeState(state);
      return refreshInventory(item);
    },
    async receiveStock(itemId, quantity, reason) {
      const state = readState();
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error("Quantity must be a positive whole number.");
      const item = applyMovement(
        state,
        itemId,
        "purchase",
        quantity,
        reason ?? null,
      );
      writeState(state);
      return item;
    },
    async issueStock(itemId, quantity, reason) {
      const state = readState();
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error("Quantity must be a positive whole number.");
      const item = applyMovement(
        state,
        itemId,
        "kitchen_issue",
        -quantity,
        reason ?? null,
      );
      writeState(state);
      return item;
    },
    async recordWaste(itemId, quantity, reason) {
      const state = readState();
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error("Quantity must be a positive whole number.");
      const item = applyMovement(state, itemId, "waste", -quantity, reason);
      writeState(state);
      return item;
    },
    async returnStock(itemId, quantity, reason) {
      const state = readState();
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error("Quantity must be a positive whole number.");
      const item = applyMovement(
        state,
        itemId,
        "return",
        quantity,
        reason ?? null,
      );
      writeState(state);
      return item;
    },
    async adjustStockToCount(itemId, countedQuantity, reason) {
      requirePermission("inventory_adjustment");
      const state = readState();
      if (!Number.isSafeInteger(countedQuantity) || countedQuantity < 0)
        throw new Error(
          "Counted quantity must be a non-negative whole number.",
        );
      const item = state.inventory.find((entry) => entry.id === itemId);
      if (!item) throw new Error("Inventory item not found.");
      const difference = countedQuantity - item.currentQuantity;
      if (difference === 0) return refreshInventory(item);
      const result = applyMovement(
        state,
        itemId,
        "adjustment",
        difference,
        reason,
      );
      writeState(state);
      return result;
    },
  };
}
