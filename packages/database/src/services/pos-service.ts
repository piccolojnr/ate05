import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  calculateOrderTotals,
  calculateKitchenDeltas,
  multiplyMoney,
  money,
  type OrderType,
} from "@ate05/domain";

export type KitchenTicketType = "initial" | "addition" | "cancellation";
export type KitchenPrintStatus = "pending" | "printed" | "failed";

export interface PosKitchenTicketItem {
  id: string;
  orderItemId: string | null;
  itemName: string;
  quantity: number;
  action: "add" | "cancel";
  notes: string | null;
}

export interface PosKitchenTicket {
  id: string;
  sequence: number;
  type: KitchenTicketType;
  printStatus: KitchenPrintStatus;
  printedAt: string | null;
  lastPrintError: string | null;
  printAttemptCount: number;
  lastAttemptAt: string | null;
  createdAt: string;
  items: PosKitchenTicketItem[];
}

export interface PosMenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface PosMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  sellingPriceMinor: number;
  available?: boolean;
  active?: boolean;
  updatedAt?: string;
}

export interface MenuManagementItem extends PosMenuItem {
  categoryName: string;
  available: boolean;
  active: boolean;
  updatedAt: string;
}

export interface MenuManagementData {
  categories: Array<PosMenuCategory & { active: boolean }>;
  items: MenuManagementItem[];
}

export interface PosTable {
  id: string;
  name: string;
  capacity: number;
  active: boolean;
  status: "available" | "occupied" | "reserved";
}

export interface PosOrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  notes: string | null;
}

export interface PosOrder {
  id: string;
  businessId: string;
  orderNumber: number;
  orderType: OrderType;
  tableId: string | null;
  tableName: string | null;
  status: string;
  paymentStatus: string;
  subtotalMinor: number;
  totalMinor: number;
  openedAt: string;
  items: PosOrderItem[];
  kitchenTickets: PosKitchenTicket[];
  kitchenChangesPending: boolean;
}

export type OpenOrderSummary = Omit<
  PosOrder,
  "items" | "kitchenTickets" | "kitchenChangesPending"
>;

export interface AddMenuItemInput {
  businessId: string;
  createdBy: string;
  menuItemId: string;
  orderType: OrderType;
  tableId?: string | null;
  orderId?: string;
}

export interface CreateOrderInput {
  businessId: string;
  createdBy: string;
  orderType: OrderType;
  tableId?: string | null;
}

export interface SendOrderToKitchenInput {
  businessId: string;
  orderId: string;
  userId: string;
}

export interface CreateTableInput {
  businessId: string;
  name: string;
  capacity?: number;
  active?: boolean;
}

export interface UpdateTableInput {
  businessId: string;
  id: string;
  name: string;
  capacity?: number;
  active: boolean;
}

export type InventoryUnit =
  "kg" | "g" | "litre" | "ml" | "bottle" | "piece" | "pack";
export type StockMovementType =
  "purchase" | "kitchen_issue" | "waste" | "return" | "adjustment";
export interface PosInventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  currentQuantity: number;
  reorderThreshold: number | null;
  active: boolean;
  stockState: "in_stock" | "low_stock" | "out_of_stock";
}
export interface PosStockMovement {
  id: string;
  inventoryItemId: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

function now(): string {
  return new Date().toISOString();
}

/** Allocate a sequence while the caller's SQLite write transaction is open. */
function nextBusinessSequence(
  sqlite: Database.Database,
  key: string,
  table: "orders" | "receipts",
  column: "order_number" | "receipt_number",
  businessId: string,
): number {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO app_metadata (key, value) SELECT ?, CAST(COALESCE(MAX(${column}), 0) AS TEXT) FROM ${table} WHERE business_id = ?`,
    )
    .run(key, businessId);
  sqlite
    .prepare(
      "UPDATE app_metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = ?",
    )
    .run(key);
  return (
    sqlite
      .prepare(
        "SELECT CAST(value AS INTEGER) AS value FROM app_metadata WHERE key = ?",
      )
      .get(key) as { value: number }
  ).value;
}

function nextKitchenSequence(
  sqlite: Database.Database,
  orderId: string,
  businessId: string,
): number {
  const key = `kitchen:${orderId}`;
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO app_metadata (key, value) SELECT ?, CAST(COALESCE(MAX(sequence), 0) AS TEXT) FROM kitchen_tickets WHERE order_id = ? AND business_id = ?",
    )
    .run(key, orderId, businessId);
  sqlite
    .prepare(
      "UPDATE app_metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = ?",
    )
    .run(key);
  return (
    sqlite
      .prepare(
        "SELECT CAST(value AS INTEGER) AS value FROM app_metadata WHERE key = ?",
      )
      .get(key) as { value: number }
  ).value;
}

function calculateTotals(
  sqlite: Database.Database,
  orderId: string,
  timestamp = now(),
): void {
  const lines = sqlite
    .prepare(
      "SELECT unit_price_minor_snapshot AS unitPriceMinor, quantity FROM order_items WHERE order_id = ?",
    )
    .all(orderId) as Array<{ unitPriceMinor: number; quantity: number }>;
  const totals = calculateOrderTotals(
    lines.map((line) => ({
      unitPriceMinor: money(line.unitPriceMinor),
      quantity: line.quantity,
    })),
  );
  sqlite
    .prepare(
      "UPDATE orders SET subtotal_minor = ?, total_minor = ?, updated_at = ? WHERE id = ?",
    )
    .run(totals.subtotalMinor, totals.totalMinor, timestamp, orderId);
}

function assertOrderShape(input: CreateOrderInput): void {
  if (input.orderType === "dine_in" && !input.tableId) {
    throw new Error("A table is required for a dine-in order.");
  }
  if (input.orderType === "takeaway" && input.tableId) {
    throw new Error("Takeaway orders cannot be assigned a table.");
  }
}

function inventoryState(
  quantity: number,
  threshold: number | null,
): PosInventoryItem["stockState"] {
  if (quantity === 0) return "out_of_stock";
  if (threshold !== null && quantity <= threshold) return "low_stock";
  return "in_stock";
}

const mutableOrderStatuses = "('open', 'sent_to_kitchen', 'preparing')";

/**
 * Local POS application service. All mutations run in a single SQLite transaction
 * so item snapshots and persisted totals always move together.
 */
export function createPosService(sqlite: Database.Database) {
  function getMenu(businessId: string) {
    const categories = sqlite
      .prepare(
        "SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE business_id = ? AND active = 1 ORDER BY sort_order, name",
      )
      .all(businessId) as PosMenuCategory[];
    const items = sqlite
      .prepare(
        "SELECT i.id, i.category_id AS categoryId, i.name, i.description, i.selling_price_minor AS sellingPriceMinor, i.available, i.active, i.updated_at AS updatedAt FROM menu_items i JOIN menu_categories c ON c.id = i.category_id WHERE i.business_id = ? AND i.active = 1 AND i.available = 1 AND c.active = 1 ORDER BY i.name",
      )
      .all(businessId) as Array<{
      id: string;
      categoryId: string;
      name: string;
      description: string | null;
      sellingPriceMinor: number;
      available: number;
      active: number;
      updatedAt: string;
    }>;
    return {
      categories,
      items: items.map((item) => ({
        ...item,
        available: Boolean(item.available),
        active: Boolean(item.active),
      })),
    };
  }

  function listMenuManagement(businessId: string): MenuManagementData {
    const categories = sqlite
      .prepare(
        "SELECT id, name, sort_order AS sortOrder, active FROM menu_categories WHERE business_id = ? ORDER BY active DESC, sort_order, name",
      )
      .all(businessId) as Array<PosMenuCategory & { active: number }>;
    const items = sqlite
      .prepare(
        "SELECT i.id, i.category_id AS categoryId, c.name AS categoryName, i.name, i.description, i.selling_price_minor AS sellingPriceMinor, i.available, i.active, i.updated_at AS updatedAt FROM menu_items i JOIN menu_categories c ON c.id = i.category_id WHERE i.business_id = ? ORDER BY i.active DESC, i.name",
      )
      .all(businessId) as Array<{
      id: string;
      categoryId: string;
      categoryName: string;
      name: string;
      description: string | null;
      sellingPriceMinor: number;
      available: number;
      active: number;
      updatedAt: string;
    }>;
    return {
      categories: categories.map((category) => ({
        ...category,
        active: Boolean(category.active),
      })),
      items: items.map((item) => ({
        ...item,
        available: Boolean(item.available),
        active: Boolean(item.active),
      })),
    };
  }

  function createMenuItem(input: {
    businessId: string;
    name: string;
    description?: string | null;
    categoryId: string;
    sellingPriceMinor: number;
    available: boolean;
    active: boolean;
  }): MenuManagementItem {
    if (!input.name.trim()) throw new Error("Menu item name is required.");
    if (
      !Number.isSafeInteger(input.sellingPriceMinor) ||
      input.sellingPriceMinor < 0
    )
      throw new Error("Price must be a valid non-negative amount.");
    const id = randomUUID();
    const createdAt = now();
    sqlite.transaction(() => {
      const category = sqlite
        .prepare(
          "SELECT id FROM menu_categories WHERE id = ? AND business_id = ? AND active = 1",
        )
        .get(input.categoryId, input.businessId);
      if (!category) throw new Error("The selected category is unavailable.");
      sqlite
        .prepare(
          "INSERT INTO menu_items (id, business_id, category_id, name, description, selling_price_minor, available, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          input.businessId,
          input.categoryId,
          input.name.trim(),
          input.description?.trim() || null,
          input.sellingPriceMinor,
          input.available ? 1 : 0,
          input.active ? 1 : 0,
          createdAt,
          createdAt,
        );
    })();
    return listMenuManagement(input.businessId).items.find(
      (item) => item.id === id,
    )!;
  }

  function updateMenuItem(input: {
    businessId: string;
    id: string;
    name: string;
    description?: string | null;
    categoryId: string;
    sellingPriceMinor: number;
    available: boolean;
    active: boolean;
  }): MenuManagementItem {
    if (!input.name.trim()) throw new Error("Menu item name is required.");
    if (
      !Number.isSafeInteger(input.sellingPriceMinor) ||
      input.sellingPriceMinor < 0
    )
      throw new Error("Price must be a valid non-negative amount.");
    const updatedAt = now();
    sqlite.transaction(() => {
      const category = sqlite
        .prepare(
          "SELECT id FROM menu_categories WHERE id = ? AND business_id = ? AND active = 1",
        )
        .get(input.categoryId, input.businessId);
      if (!category) throw new Error("The selected category is unavailable.");
      const result = sqlite
        .prepare(
          "UPDATE menu_items SET name = ?, description = ?, category_id = ?, selling_price_minor = ?, available = ?, active = ?, updated_at = ? WHERE id = ? AND business_id = ?",
        )
        .run(
          input.name.trim(),
          input.description?.trim() || null,
          input.categoryId,
          input.sellingPriceMinor,
          input.available ? 1 : 0,
          input.active ? 1 : 0,
          updatedAt,
          input.id,
          input.businessId,
        );
      if (result.changes !== 1) throw new Error("Menu item not found.");
    })();
    return listMenuManagement(input.businessId).items.find(
      (item) => item.id === input.id,
    )!;
  }

  function createMenuCategory(input: {
    businessId: string;
    name: string;
  }): PosMenuCategory {
    if (!input.name.trim()) throw new Error("Category name is required.");
    const id = randomUUID();
    const createdAt = now();
    const next = sqlite
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM menu_categories WHERE business_id = ?",
      )
      .get(input.businessId) as { sortOrder: number };
    sqlite
      .prepare(
        "INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      )
      .run(
        id,
        input.businessId,
        input.name.trim(),
        next.sortOrder,
        createdAt,
        createdAt,
      );
    return { id, name: input.name.trim(), sortOrder: next.sortOrder };
  }

  function updateMenuCategory(input: {
    businessId: string;
    id: string;
    name: string;
    active: boolean;
  }): PosMenuCategory {
    if (!input.name.trim()) throw new Error("Category name is required.");
    if (!input.active) {
      const activeItem = sqlite
        .prepare(
          "SELECT 1 FROM menu_items WHERE category_id = ? AND business_id = ? AND active = 1 LIMIT 1",
        )
        .get(input.id, input.businessId);
      if (activeItem)
        throw new Error(
          "Deactivate or reassign active items before disabling this category.",
        );
    }
    const result = sqlite
      .prepare(
        "UPDATE menu_categories SET name = ?, active = ?, updated_at = ? WHERE id = ? AND business_id = ?",
      )
      .run(
        input.name.trim(),
        input.active ? 1 : 0,
        now(),
        input.id,
        input.businessId,
      );
    if (result.changes !== 1) throw new Error("Category not found.");
    const category = sqlite
      .prepare(
        "SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE id = ? AND business_id = ?",
      )
      .get(input.id, input.businessId) as PosMenuCategory;
    return category;
  }
  function listAvailableTables(businessId: string): PosTable[] {
    const rows = sqlite
      .prepare(
        `SELECT t.id, t.name, t.capacity, t.active,
        CASE WHEN EXISTS (
          SELECT 1 FROM orders o
          WHERE o.table_id = t.id AND o.business_id = t.business_id
            AND o.order_type = 'dine_in'
            AND o.status IN ('open', 'sent_to_kitchen', 'preparing', 'ready')
        ) THEN 'occupied' ELSE t.status END AS status
        FROM restaurant_tables t
        WHERE t.business_id = ?
        ORDER BY t.name`,
      )
      .all(businessId) as Array<{
      id: string;
      name: string;
      capacity: number;
      active: number;
      status: PosTable["status"];
    }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      active: Boolean(row.active),
      status: row.status,
    }));
  }

  function createTable(input: CreateTableInput): PosTable {
    const name = input.name.trim();
    if (!name) throw new Error("Table name is required.");
    const capacity = input.capacity ?? 4;
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new Error("Table capacity must be a positive whole number.");
    const id = randomUUID();
    const duplicate = sqlite
      .prepare(
        "SELECT id FROM restaurant_tables WHERE business_id = ? AND lower(name) = lower(?)",
      )
      .get(input.businessId, name);
    if (duplicate) throw new Error("A table with this name already exists.");
    try {
      sqlite
        .prepare(
          "INSERT INTO restaurant_tables (id, business_id, name, capacity, status, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)",
        )
        .run(
          id,
          input.businessId,
          name,
          capacity,
          input.active === false ? 0 : 1,
          now(),
          now(),
        );
    } catch (cause) {
      if (String(cause).includes("restaurant_tables_business_name_unique"))
        throw new Error("A table with this name already exists.");
      throw cause;
    }
    return listAvailableTables(input.businessId).find(
      (table) => table.id === id,
    )!;
  }

  function updateTable(input: UpdateTableInput): PosTable {
    const name = input.name.trim();
    if (!name) throw new Error("Table name is required.");
    const capacity = input.capacity ?? 4;
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new Error("Table capacity must be a positive whole number.");
    const duplicate = sqlite
      .prepare(
        "SELECT id FROM restaurant_tables WHERE business_id = ? AND lower(name) = lower(?) AND id <> ?",
      )
      .get(input.businessId, name, input.id);
    if (duplicate) throw new Error("A table with this name already exists.");
    try {
      sqlite.transaction(() => {
        const table = sqlite
          .prepare(
            "SELECT id FROM restaurant_tables WHERE id = ? AND business_id = ?",
          )
          .get(input.id, input.businessId);
        if (!table) throw new Error("Table not found.");
        const activeOrder = sqlite
          .prepare(
            "SELECT 1 FROM orders WHERE table_id = ? AND business_id = ? AND order_type = 'dine_in' AND status IN ('open', 'sent_to_kitchen', 'preparing', 'ready') LIMIT 1",
          )
          .get(input.id, input.businessId);
        if (activeOrder && !input.active)
          throw new Error(
            "Complete the active order before deactivating this table.",
          );
        sqlite
          .prepare(
            "UPDATE restaurant_tables SET name = ?, capacity = ?, active = ?, updated_at = ? WHERE id = ? AND business_id = ?",
          )
          .run(
            name,
            capacity,
            input.active ? 1 : 0,
            now(),
            input.id,
            input.businessId,
          );
      })();
    } catch (cause) {
      if (String(cause).includes("restaurant_tables_business_name_unique"))
        throw new Error("A table with this name already exists.");
      throw cause;
    }
    return listAvailableTables(input.businessId).find(
      (table) => table.id === input.id,
    )!;
  }

  function setTableReservationState(
    businessId: string,
    tableId: string,
    reserved: boolean,
  ): PosTable {
    sqlite.transaction(() => {
      const table = sqlite
        .prepare(
          "SELECT id, status FROM restaurant_tables WHERE id = ? AND business_id = ? AND active = 1",
        )
        .get(tableId, businessId) as { id: string; status: string } | undefined;
      if (!table) throw new Error("Table is unavailable.");
      const activeOrder = sqlite
        .prepare(
          "SELECT 1 FROM orders WHERE table_id = ? AND business_id = ? AND order_type = 'dine_in' AND status IN ('open', 'sent_to_kitchen', 'preparing', 'ready') LIMIT 1",
        )
        .get(tableId, businessId);
      if (activeOrder) throw new Error("Table already has an active order.");
      if (!reserved && table.status !== "reserved") return;
      sqlite
        .prepare(
          "UPDATE restaurant_tables SET status = ?, updated_at = ? WHERE id = ? AND business_id = ?",
        )
        .run(reserved ? "reserved" : "available", now(), tableId, businessId);
    })();
    return listAvailableTables(businessId).find(
      (table) => table.id === tableId,
    )!;
  }

  function createOrder(input: CreateOrderInput): PosOrder {
    assertOrderShape(input);
    const createdAt = now();
    const id = randomUUID();
    sqlite.transaction(() => {
      if (input.tableId) {
        const table = sqlite
          .prepare(
            "SELECT id FROM restaurant_tables WHERE id = ? AND business_id = ? AND active = 1",
          )
          .get(input.tableId, input.businessId);
        if (!table) throw new Error("The selected table is unavailable.");
        const activeOrder = sqlite
          .prepare(
            "SELECT 1 FROM orders WHERE table_id = ? AND business_id = ? AND order_type = 'dine_in' AND status IN ('open', 'sent_to_kitchen', 'preparing', 'ready') LIMIT 1",
          )
          .get(input.tableId, input.businessId);
        if (activeOrder)
          throw new Error("This table already has an active order.");
      }
      const nextNumber = nextBusinessSequence(
        sqlite,
        `order:${input.businessId}`,
        "orders",
        "order_number",
        input.businessId,
      );
      sqlite
        .prepare(
          "INSERT INTO orders (id, business_id, order_number, order_type, table_id, created_by, status, payment_status, subtotal_minor, discount_minor, total_minor, opened_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 'unpaid', 0, 0, 0, ?, ?, ?)",
        )
        .run(
          id,
          input.businessId,
          nextNumber,
          input.orderType,
          input.tableId ?? null,
          input.createdBy,
          createdAt,
          createdAt,
          createdAt,
        );
      if (input.tableId)
        sqlite
          .prepare(
            "UPDATE restaurant_tables SET status = 'occupied', updated_at = ? WHERE id = ? AND business_id = ?",
          )
          .run(createdAt, input.tableId, input.businessId);
    })();
    return getOrder(id, input.businessId);
  }

  function addMenuItem(input: AddMenuItemInput): PosOrder {
    let orderId = input.orderId;
    sqlite.transaction(() => {
      const menuItem = sqlite
        .prepare(
          "SELECT id, name, selling_price_minor AS sellingPriceMinor FROM menu_items WHERE id = ? AND business_id = ? AND active = 1 AND available = 1",
        )
        .get(input.menuItemId, input.businessId) as
        { id: string; name: string; sellingPriceMinor: number } | undefined;
      if (!menuItem) throw new Error("This menu item is unavailable.");
      if (!orderId) orderId = createOrder(input).id;
      const order = sqlite
        .prepare(
          "SELECT id, business_id AS businessId, status FROM orders WHERE id = ? AND business_id = ?",
        )
        .get(orderId, input.businessId) as
        { id: string; businessId: string; status: string } | undefined;
      if (
        !order ||
        !["open", "sent_to_kitchen", "preparing"].includes(order.status)
      )
        throw new Error("This order can no longer be changed.");
      const existing = sqlite
        .prepare(
          "SELECT id, quantity, unit_price_minor_snapshot AS unitPriceMinor FROM order_items WHERE order_id = ? AND menu_item_id = ? AND notes IS NULL",
        )
        .get(orderId, input.menuItemId) as
        { id: string; quantity: number; unitPriceMinor: number } | undefined;
      const timestamp = now();
      if (existing) {
        const quantity = existing.quantity + 1;
        sqlite
          .prepare(
            "UPDATE order_items SET quantity = ?, line_total_minor = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            quantity,
            multiplyMoney(money(existing.unitPriceMinor), quantity),
            timestamp,
            existing.id,
          );
      } else {
        sqlite
          .prepare(
            "INSERT INTO order_items (id, business_id, order_id, menu_item_id, item_name_snapshot, unit_price_minor_snapshot, quantity, line_total_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
          )
          .run(
            randomUUID(),
            input.businessId,
            orderId,
            menuItem.id,
            menuItem.name,
            menuItem.sellingPriceMinor,
            menuItem.sellingPriceMinor,
            timestamp,
            timestamp,
          );
      }
      calculateTotals(sqlite, orderId, timestamp);
    })();
    return getOrder(orderId!, input.businessId);
  }

  function updateOrderItemQuantity(
    businessId: string,
    orderId: string,
    itemId: string,
    quantity: number,
  ): PosOrder {
    sqlite.transaction(() => {
      const item = sqlite
        .prepare(
          `SELECT oi.id, oi.unit_price_minor_snapshot AS unitPriceMinor FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ? AND oi.order_id = ? AND o.business_id = ? AND o.status IN ${mutableOrderStatuses}`,
        )
        .get(itemId, orderId, businessId) as
        { id: string; unitPriceMinor: number } | undefined;
      if (!item) throw new Error("Order item is unavailable.");
      if (!Number.isSafeInteger(quantity) || quantity < 0)
        throw new Error("Quantity must be a non-negative whole number.");
      const timestamp = now();
      if (quantity === 0)
        sqlite.prepare("DELETE FROM order_items WHERE id = ?").run(item.id);
      else
        sqlite
          .prepare(
            "UPDATE order_items SET quantity = ?, line_total_minor = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            quantity,
            multiplyMoney(money(item.unitPriceMinor), quantity),
            timestamp,
            item.id,
          );
      calculateTotals(sqlite, orderId, timestamp);
    })();
    return getOrder(orderId, businessId);
  }

  function updateOrderItemNote(
    businessId: string,
    orderId: string,
    itemId: string,
    notes: string | null,
  ): PosOrder {
    const updated = sqlite
      .prepare(
        `UPDATE order_items SET notes = ?, updated_at = ? WHERE id = ? AND order_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND business_id = ? AND status IN ${mutableOrderStatuses})`,
      )
      .run(notes?.trim() || null, now(), itemId, orderId, orderId, businessId);
    if (updated.changes !== 1) throw new Error("Order item is unavailable.");
    return getOrder(orderId, businessId);
  }

  function getOrder(orderId: string, businessId: string): PosOrder {
    const order = sqlite
      .prepare(
        "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.id = ? AND o.business_id = ?",
      )
      .get(orderId, businessId) as PosOrder | undefined;
    if (!order) throw new Error("Order not found.");
    order.items = sqlite
      .prepare(
        "SELECT id, menu_item_id AS menuItemId, item_name_snapshot AS name, unit_price_minor_snapshot AS unitPriceMinor, quantity, line_total_minor AS lineTotalMinor, notes FROM order_items WHERE order_id = ? ORDER BY created_at, id",
      )
      .all(orderId) as PosOrderItem[];
    const kitchenTickets = listKitchenTickets(orderId, businessId);
    const syncLines = getKitchenSyncLines(orderId, businessId);
    order.kitchenTickets = kitchenTickets;
    order.kitchenChangesPending =
      calculateKitchenDeltas(syncLines, kitchenTickets.length > 0).length > 0;
    return order;
  }

  function listOpenOrders(businessId: string): OpenOrderSummary[] {
    return sqlite
      .prepare(
        `SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.business_id = ? AND o.status IN ${mutableOrderStatuses} ORDER BY o.opened_at DESC, o.order_number DESC`,
      )
      .all(businessId) as OpenOrderSummary[];
  }

  function completeOrder(orderId: string, businessId: string): PosOrder {
    sqlite.transaction(() => {
      const order = sqlite
        .prepare(
          "SELECT id, table_id AS tableId, order_type AS orderType, status FROM orders WHERE id = ? AND business_id = ?",
        )
        .get(orderId, businessId) as
        | {
            id: string;
            tableId: string | null;
            orderType: string;
            status: string;
          }
        | undefined;
      if (!order) throw new Error("Order not found.");
      if (
        !["open", "sent_to_kitchen", "preparing", "ready"].includes(
          order.status,
        )
      )
        throw new Error("Only an active order can be completed.");
      const completedAt = now();
      sqlite
        .prepare(
          "UPDATE orders SET status = 'completed', closed_at = ?, updated_at = ? WHERE id = ? AND business_id = ?",
        )
        .run(completedAt, completedAt, orderId, businessId);
      if (order.orderType === "dine_in" && order.tableId)
        sqlite
          .prepare(
            "UPDATE restaurant_tables SET status = 'available', updated_at = ? WHERE id = ? AND business_id = ? AND NOT EXISTS (SELECT 1 FROM orders WHERE table_id = ? AND business_id = ? AND id <> ? AND order_type = 'dine_in' AND status IN ('open', 'sent_to_kitchen', 'preparing', 'ready'))",
          )
          .run(
            completedAt,
            order.tableId,
            businessId,
            order.tableId,
            businessId,
            orderId,
          );
    })();
    return getOrder(orderId, businessId);
  }

  function mapInventory(row: {
    id: string;
    name: string;
    unit: InventoryUnit;
    currentQuantity: number;
    reorderThreshold: number | null;
    active: number;
  }): PosInventoryItem {
    return {
      ...row,
      active: Boolean(row.active),
      stockState: inventoryState(row.currentQuantity, row.reorderThreshold),
    };
  }

  function listInventory(businessId: string): PosInventoryItem[] {
    return (
      sqlite
        .prepare(
          "SELECT id, name, unit, current_quantity AS currentQuantity, reorder_threshold AS reorderThreshold, active FROM inventory_items WHERE business_id = ? ORDER BY active DESC, name",
        )
        .all(businessId) as Array<{
        id: string;
        name: string;
        unit: InventoryUnit;
        currentQuantity: number;
        reorderThreshold: number | null;
        active: number;
      }>
    ).map(mapInventory);
  }

  function listStockMovements(
    itemId: string,
    businessId: string,
  ): PosStockMovement[] {
    return sqlite
      .prepare(
        "SELECT id, inventory_item_id AS inventoryItemId, type, quantity_delta AS quantityDelta, balance_after AS balanceAfter, reason, created_by AS createdBy, created_at AS createdAt FROM stock_movements WHERE inventory_item_id = ? AND business_id = ? ORDER BY created_at DESC, id DESC",
      )
      .all(itemId, businessId) as PosStockMovement[];
  }

  function createInventoryItem(input: {
    businessId: string;
    createdBy: string;
    name: string;
    unit: InventoryUnit;
    startingQuantity: number;
    reorderThreshold: number | null;
  }): PosInventoryItem {
    if (!input.name.trim()) throw new Error("Inventory item name is required.");
    if (
      !Number.isSafeInteger(input.startingQuantity) ||
      input.startingQuantity < 0
    )
      throw new Error("Starting quantity must be a non-negative whole number.");
    if (
      input.reorderThreshold !== null &&
      (!Number.isSafeInteger(input.reorderThreshold) ||
        input.reorderThreshold < 0)
    )
      throw new Error("Reorder threshold must be a non-negative whole number.");
    const id = randomUUID();
    const createdAt = now();
    sqlite.transaction(() => {
      sqlite
        .prepare(
          "INSERT INTO inventory_items (id, business_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, 1, ?, ?)",
        )
        .run(
          id,
          input.businessId,
          input.name.trim(),
          input.unit,
          input.reorderThreshold,
          createdAt,
          createdAt,
        );
      if (input.startingQuantity > 0)
        sqlite
          .prepare(
            "INSERT INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES (?, ?, ?, 'purchase', ?, ?, 'Opening balance', ?, ?)",
          )
          .run(
            randomUUID(),
            input.businessId,
            id,
            input.startingQuantity,
            input.startingQuantity,
            input.createdBy,
            createdAt,
          );
      sqlite
        .prepare(
          "UPDATE inventory_items SET current_quantity = ?, updated_at = ? WHERE id = ?",
        )
        .run(input.startingQuantity, createdAt, id);
    })();
    return listInventory(input.businessId).find((item) => item.id === id)!;
  }

  function updateInventoryItem(input: {
    businessId: string;
    id: string;
    name: string;
    unit: InventoryUnit;
    reorderThreshold: number | null;
    active: boolean;
  }): PosInventoryItem {
    const item = sqlite
      .prepare(
        "SELECT id, unit FROM inventory_items WHERE id = ? AND business_id = ?",
      )
      .get(input.id, input.businessId) as
      { id: string; unit: InventoryUnit } | undefined;
    if (!item) throw new Error("Inventory item not found.");
    const movement = sqlite
      .prepare(
        "SELECT 1 FROM stock_movements WHERE inventory_item_id = ? AND business_id = ? LIMIT 1",
      )
      .get(input.id, input.businessId);
    if (movement && item.unit !== input.unit)
      throw new Error(
        "Unit cannot change after stock movement history exists.",
      );
    sqlite
      .prepare(
        "UPDATE inventory_items SET name = ?, unit = ?, reorder_threshold = ?, active = ?, updated_at = ? WHERE id = ? AND business_id = ?",
      )
      .run(
        input.name.trim(),
        input.unit,
        input.reorderThreshold,
        input.active ? 1 : 0,
        now(),
        input.id,
        input.businessId,
      );
    return listInventory(input.businessId).find(
      (entry) => entry.id === input.id,
    )!;
  }

  function recordStockMovement(input: {
    businessId: string;
    createdBy: string;
    itemId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string;
    adjustmentDelta?: number;
  }): PosInventoryItem {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
      throw new Error("Quantity must be a positive whole number.");
    if (
      (input.type === "waste" || input.type === "adjustment") &&
      !input.reason?.trim()
    )
      throw new Error("A reason is required for this movement.");
    let result!: PosInventoryItem;
    sqlite.transaction(() => {
      const item = sqlite
        .prepare(
          "SELECT id, current_quantity AS currentQuantity, reorder_threshold AS reorderThreshold, name, unit, active FROM inventory_items WHERE id = ? AND business_id = ?",
        )
        .get(input.itemId, input.businessId) as
        | {
            id: string;
            currentQuantity: number;
            reorderThreshold: number | null;
            name: string;
            unit: InventoryUnit;
            active: number;
          }
        | undefined;
      if (!item) throw new Error("Inventory item not found.");
      if (!item.active) throw new Error("Inventory item is inactive.");
      const decreases =
        input.type === "kitchen_issue" ||
        input.type === "waste" ||
        input.type === "adjustment";
      const delta =
        input.type === "adjustment"
          ? (input.adjustmentDelta ?? input.quantity)
          : decreases
            ? -input.quantity
            : input.quantity;
      const next = item.currentQuantity + delta;
      if (next < 0)
        throw new Error(
          "Only " + item.currentQuantity + " " + item.unit + " is available.",
        );
      const createdAt = now();
      sqlite
        .prepare(
          "INSERT INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          input.businessId,
          input.itemId,
          input.type,
          delta,
          next,
          input.reason?.trim() || null,
          input.createdBy,
          createdAt,
        );
      sqlite
        .prepare(
          "UPDATE inventory_items SET current_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?",
        )
        .run(next, createdAt, input.itemId, input.businessId);
      result = mapInventory({ ...item, currentQuantity: next });
    })();
    return result;
  }

  function getKitchenSyncLines(orderId: string, businessId: string) {
    const current = sqlite
      .prepare(
        `SELECT oi.id AS orderItemId, oi.item_name_snapshot AS itemName, oi.quantity, oi.notes
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.order_id = ? AND o.business_id = ?`,
      )
      .all(orderId, businessId) as Array<{
      orderItemId: string;
      itemName: string;
      quantity: number;
      notes: string | null;
    }>;
    const sent = sqlite
      .prepare(
        `SELECT kti.order_item_id AS orderItemId,
          SUM(CASE WHEN kti.action = 'add' THEN kti.quantity ELSE -kti.quantity END) AS sentQuantity
         FROM kitchen_ticket_items kti
         JOIN kitchen_tickets kt ON kt.id = kti.kitchen_ticket_id
         WHERE kt.order_id = ? AND kt.business_id = ? AND kti.order_item_id IS NOT NULL
         GROUP BY kti.order_item_id`,
      )
      .all(orderId, businessId) as Array<{
      orderItemId: string;
      sentQuantity: number;
    }>;
    const currentIds = new Set(current.map((line) => line.orderItemId));
    const sentMap = new Map(sent.map((line) => [line.orderItemId, line]));
    const latestNote = (
      orderItemId: string,
    ): { itemName: string; notes: string | null } | undefined =>
      sqlite
        .prepare(
          `SELECT kti.item_name_snapshot AS itemName, kti.notes
           FROM kitchen_ticket_items kti JOIN kitchen_tickets kt ON kt.id = kti.kitchen_ticket_id
           WHERE kt.order_id = ? AND kt.business_id = ? AND kti.order_item_id = ? AND kti.action = 'add'
           ORDER BY kt.sequence DESC, kti.created_at DESC LIMIT 1`,
        )
        .get(orderId, businessId, orderItemId) as
        { itemName: string; notes: string | null } | undefined;
    const withState = current.map((line) => {
      const sentLine = sentMap.get(line.orderItemId);
      const latest = latestNote(line.orderItemId);
      return {
        ...line,
        sentQuantity: sentLine?.sentQuantity ?? 0,
        sentNotes: latest?.notes ?? null,
      };
    });
    for (const sentLine of sent) {
      if (currentIds.has(sentLine.orderItemId)) continue;
      const latest = latestNote(sentLine.orderItemId);
      if (latest) {
        withState.push({
          orderItemId: sentLine.orderItemId,
          itemName: latest.itemName,
          quantity: 0,
          notes: null,
          sentQuantity: sentLine.sentQuantity,
          sentNotes: latest.notes,
        });
      }
    }
    return withState;
  }

  function listKitchenTickets(
    orderId: string,
    businessId: string,
  ): PosKitchenTicket[] {
    const tickets = sqlite
      .prepare(
        "SELECT id, sequence, type, print_status AS printStatus, printed_at AS printedAt, last_print_error AS lastPrintError, print_attempt_count AS printAttemptCount, last_attempt_at AS lastAttemptAt, created_at AS createdAt FROM kitchen_tickets WHERE order_id = ? AND business_id = ? ORDER BY sequence",
      )
      .all(orderId, businessId) as Array<{
      id: string;
      sequence: number;
      type: KitchenTicketType;
      printStatus: KitchenPrintStatus;
      printedAt: string | null;
      lastPrintError: string | null;
      printAttemptCount: number;
      lastAttemptAt: string | null;
      createdAt: string;
    }>;
    const itemQuery = sqlite.prepare(
      "SELECT id, order_item_id AS orderItemId, item_name_snapshot AS itemName, quantity, action, notes FROM kitchen_ticket_items WHERE kitchen_ticket_id = ? ORDER BY created_at, id",
    );
    return tickets.map((ticket) => ({
      ...ticket,
      items: itemQuery.all(ticket.id) as PosKitchenTicketItem[],
    }));
  }

  function sendOrderToKitchen(input: SendOrderToKitchenInput): PosOrder {
    sqlite.transaction(() => {
      const order = sqlite
        .prepare(
          `SELECT id, status FROM orders WHERE id = ? AND business_id = ? AND status IN ${mutableOrderStatuses}`,
        )
        .get(input.orderId, input.businessId) as
        { id: string; status: string } | undefined;
      if (!order)
        throw new Error("Only an active order can be sent to the kitchen.");
      const user = sqlite
        .prepare(
          "SELECT id FROM users WHERE id = ? AND business_id = ? AND active = 1",
        )
        .get(input.userId, input.businessId);
      if (!user) throw new Error("The sending user is unavailable.");
      const tickets = listKitchenTickets(input.orderId, input.businessId);
      const deltas = calculateKitchenDeltas(
        getKitchenSyncLines(input.orderId, input.businessId),
        tickets.length > 0,
      );
      if (deltas.length === 0) return;
      let sequence = nextKitchenSequence(
        sqlite,
        input.orderId,
        input.businessId,
      );
      const insertTicket = sqlite.prepare(
        "INSERT INTO kitchen_tickets (id, business_id, order_id, sequence, type, created_by, print_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      );
      const insertItem = sqlite.prepare(
        "INSERT INTO kitchen_ticket_items (id, business_id, kitchen_ticket_id, order_item_id, item_name_snapshot, quantity, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const delta of deltas) {
        const ticketId = randomUUID();
        const timestamp = now();
        insertTicket.run(
          ticketId,
          input.businessId,
          input.orderId,
          sequence++,
          delta.type,
          input.userId,
          timestamp,
          timestamp,
        );
        for (const item of delta.items)
          insertItem.run(
            randomUUID(),
            input.businessId,
            ticketId,
            item.orderItemId,
            item.itemName,
            item.quantity,
            item.action,
            item.notes,
            timestamp,
          );
      }
      sqlite
        .prepare(
          "UPDATE orders SET status = CASE WHEN status = 'open' THEN 'sent_to_kitchen' ELSE status END, updated_at = ? WHERE id = ? AND business_id = ?",
        )
        .run(now(), input.orderId, input.businessId);
    })();
    return getOrder(input.orderId, input.businessId);
  }

  return {
    addMenuItem,
    createOrder,
    getMenu,
    listMenuManagement,
    createMenuItem,
    updateMenuItem,
    createMenuCategory,
    updateMenuCategory,
    getOrder,
    listAvailableTables,
    createTable,
    updateTable,
    setTableReservationState,
    completeOrder,
    listOpenOrders,
    sendOrderToKitchen,
    updateOrderItemNote,
    updateOrderItemQuantity,
    listInventory,
    listStockMovements,
    createInventoryItem,
    updateInventoryItem,
    receiveStock: (
      businessId: string,
      createdBy: string,
      itemId: string,
      quantity: number,
      reason?: string,
    ) =>
      recordStockMovement({
        businessId,
        createdBy,
        itemId,
        quantity,
        reason,
        type: "purchase",
      }),
    issueStock: (
      businessId: string,
      createdBy: string,
      itemId: string,
      quantity: number,
      reason?: string,
    ) =>
      recordStockMovement({
        businessId,
        createdBy,
        itemId,
        quantity,
        reason,
        type: "kitchen_issue",
      }),
    recordWaste: (
      businessId: string,
      createdBy: string,
      itemId: string,
      quantity: number,
      reason: string,
    ) =>
      recordStockMovement({
        businessId,
        createdBy,
        itemId,
        quantity,
        reason,
        type: "waste",
      }),
    returnStock: (
      businessId: string,
      createdBy: string,
      itemId: string,
      quantity: number,
      reason?: string,
    ) =>
      recordStockMovement({
        businessId,
        createdBy,
        itemId,
        quantity,
        reason,
        type: "return",
      }),
    adjustStockToCount: (
      businessId: string,
      createdBy: string,
      itemId: string,
      countedQuantity: number,
      reason: string,
    ) => {
      const item = sqlite
        .prepare(
          "SELECT current_quantity AS currentQuantity FROM inventory_items WHERE id = ? AND business_id = ?",
        )
        .get(itemId, businessId) as { currentQuantity: number } | undefined;
      if (!item) throw new Error("Inventory item not found.");
      const difference = countedQuantity - item.currentQuantity;
      if (!Number.isSafeInteger(countedQuantity) || countedQuantity < 0)
        throw new Error(
          "Counted quantity must be a non-negative whole number.",
        );
      if (difference === 0)
        return listInventory(businessId).find((entry) => entry.id === itemId)!;
      return recordStockMovement({
        businessId,
        createdBy,
        itemId,
        quantity: Math.abs(difference),
        adjustmentDelta: difference,
        reason,
        type: "adjustment",
      });
    },
  };
}
