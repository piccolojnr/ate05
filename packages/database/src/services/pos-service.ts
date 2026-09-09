import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  calculateOrderTotals,
  multiplyMoney,
  money,
  type OrderType,
} from "@ate05/domain";

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
}

export interface PosTable {
  id: string;
  name: string;
  capacity: number;
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
}

export type OpenOrderSummary = Omit<PosOrder, "items">;

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

function now(): string {
  return new Date().toISOString();
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
        "SELECT i.id, i.category_id AS categoryId, i.name, i.description, i.selling_price_minor AS sellingPriceMinor FROM menu_items i JOIN menu_categories c ON c.id = i.category_id WHERE i.business_id = ? AND i.active = 1 AND i.available = 1 AND c.active = 1 ORDER BY i.name",
      )
      .all(businessId) as PosMenuItem[];
    return { categories, items };
  }

  function listAvailableTables(businessId: string): PosTable[] {
    return sqlite
      .prepare(
        `SELECT t.id, t.name, t.capacity,
        CASE WHEN EXISTS (
          SELECT 1 FROM orders o
          WHERE o.table_id = t.id AND o.business_id = t.business_id
            AND o.order_type = 'dine_in'
            AND o.status IN ('open', 'sent_to_kitchen', 'preparing', 'ready')
        ) THEN 'occupied' ELSE t.status END AS status
        FROM restaurant_tables t
        WHERE t.business_id = ? AND t.active = 1
        ORDER BY t.name`,
      )
      .all(businessId) as PosTable[];
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
      }
      const next = sqlite
        .prepare(
          "SELECT COALESCE(MAX(order_number), 0) + 1 AS nextNumber FROM orders WHERE business_id = ?",
        )
        .get(input.businessId) as { nextNumber: number };
      sqlite
        .prepare(
          "INSERT INTO orders (id, business_id, order_number, order_type, table_id, created_by, status, payment_status, subtotal_minor, discount_minor, total_minor, opened_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 'unpaid', 0, 0, 0, ?, ?, ?)",
        )
        .run(
          id,
          input.businessId,
          next.nextNumber,
          input.orderType,
          input.tableId ?? null,
          input.createdBy,
          createdAt,
          createdAt,
          createdAt,
        );
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
      if (!order || order.status !== "open")
        throw new Error("Only open orders can be changed.");
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
          "SELECT oi.id, oi.unit_price_minor_snapshot AS unitPriceMinor FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ? AND oi.order_id = ? AND o.business_id = ? AND o.status = 'open'",
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
        "UPDATE order_items SET notes = ?, updated_at = ? WHERE id = ? AND order_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND business_id = ? AND status = 'open')",
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
    return order;
  }

  function listOpenOrders(businessId: string): OpenOrderSummary[] {
    return sqlite
      .prepare(
        "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.business_id = ? AND o.status = 'open' ORDER BY o.opened_at DESC, o.order_number DESC",
      )
      .all(businessId) as OpenOrderSummary[];
  }

  return {
    addMenuItem,
    createOrder,
    getMenu,
    getOrder,
    listAvailableTables,
    listOpenOrders,
    updateOrderItemNote,
    updateOrderItemQuantity,
  };
}
