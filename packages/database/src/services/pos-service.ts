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
        "SELECT id, sequence, type, print_status AS printStatus, printed_at AS printedAt, created_at AS createdAt FROM kitchen_tickets WHERE order_id = ? AND business_id = ? ORDER BY sequence",
      )
      .all(orderId, businessId) as Array<{
      id: string;
      sequence: number;
      type: KitchenTicketType;
      printStatus: KitchenPrintStatus;
      printedAt: string | null;
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
      const next = sqlite
        .prepare(
          "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM kitchen_tickets WHERE order_id = ?",
        )
        .get(input.orderId) as { sequence: number };
      const insertTicket = sqlite.prepare(
        "INSERT INTO kitchen_tickets (id, business_id, order_id, sequence, type, created_by, print_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      );
      const insertItem = sqlite.prepare(
        "INSERT INTO kitchen_ticket_items (id, business_id, kitchen_ticket_id, order_item_id, item_name_snapshot, quantity, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      let sequence = next.sequence;
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
    getOrder,
    listAvailableTables,
    listOpenOrders,
    sendOrderToKitchen,
    updateOrderItemNote,
    updateOrderItemQuantity,
  };
}
