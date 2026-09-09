import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import {
  calculateKitchenDeltas,
  calculateOrderTotals,
  money,
  multiplyMoney,
  type KitchenSyncLine,
} from "@ate05/domain";
import type {
  KitchenTicket,
  OrderType,
  PosBootstrap,
  PosClient,
  PosOrder,
  PosPrinterConfig,
} from "./pos-client";
import type { PaperWidth } from "@ate05/printing";

const databaseUrl = "sqlite:ate05.db";
const businessId = "00000000-0000-4000-8000-000000000001";
const createdBy = "00000000-0000-4000-8000-000000000002";
let databasePromise: Promise<Database> | undefined;
type SqlDatabase = Awaited<ReturnType<typeof Database.load>>;
type Row = Record<string, unknown>;

export class PosClientError extends Error {
  constructor(
    public readonly code:
      "validation" | "not_found" | "unavailable" | "invalid_state" | "database",
    message: string,
  ) {
    super(message);
    this.name = "PosClientError";
  }
}

function timestamp(): string {
  return new Date().toISOString();
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}
function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
async function database(): Promise<SqlDatabase> {
  databasePromise ??= Database.load(databaseUrl);
  return databasePromise;
}
async function select<T extends Row>(
  db: SqlDatabase,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  try {
    return await db.select<T[]>(sql, values);
  } catch {
    throw new PosClientError(
      "database",
      "Local database is unavailable. Please contact a manager.",
    );
  }
}
async function execute(
  db: SqlDatabase,
  sql: string,
  values: unknown[] = [],
): Promise<void> {
  try {
    await db.execute(sql, values);
  } catch {
    throw new PosClientError(
      "database",
      "Local database could not save this change.",
    );
  }
}

async function ensureBootstrap(db: SqlDatabase): Promise<void> {
  const now = timestamp();
  await execute(
    db,
    "INSERT OR IGNORE INTO businesses (id, name, active, created_at, updated_at) VALUES ($1, 'ATE05', 1, $2, $2)",
    [businessId, now],
  );
  await execute(
    db,
    "INSERT OR IGNORE INTO users (id, business_id, name, role, active, created_at, updated_at) VALUES ($1, $2, 'ATE05 Owner', 'owner', 1, $3, $3)",
    [createdBy, businessId, now],
  );
  if (import.meta.env.DEV) await seedDevelopmentData(db);
}
async function seedDevelopmentData(db: SqlDatabase): Promise<void> {
  const [existing] = await select<Row>(
    db,
    "SELECT id FROM menu_items WHERE business_id = $1 LIMIT 1",
    [businessId],
  );
  if (existing) return;
  const now = timestamp();
  const categoryRows: Array<[string, string, number]> = [
    ["00000000-0000-4000-8000-000000000010", "Rice", 1],
    ["00000000-0000-4000-8000-000000000011", "Drinks", 2],
    ["00000000-0000-4000-8000-000000000012", "Sides", 3],
  ];
  for (const [id, name, sortOrder] of categoryRows)
    await execute(
      db,
      "INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES ($1, $2, $3, $4, 1, $5, $5)",
      [id, businessId, name, sortOrder, now],
    );
  const itemRows: Array<[string, string, string, number]> = [
    [
      "00000000-0000-4000-8000-000000000020",
      "00000000-0000-4000-8000-000000000010",
      "Fried Rice",
      5000,
    ],
    [
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000010",
      "Jollof Rice",
      4500,
    ],
    [
      "00000000-0000-4000-8000-000000000022",
      "00000000-0000-4000-8000-000000000012",
      "Chicken Wings",
      3500,
    ],
    [
      "00000000-0000-4000-8000-000000000023",
      "00000000-0000-4000-8000-000000000011",
      "Coke",
      1200,
    ],
  ];
  for (const [id, categoryId, name, price] of itemRows)
    await execute(
      db,
      "INSERT INTO menu_items (id, business_id, category_id, name, selling_price_minor, available, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, 1, $6, $6)",
      [id, businessId, categoryId, name, price, now],
    );
  for (const number of [1, 2, 3, 4])
    await execute(
      db,
      "INSERT INTO restaurant_tables (id, business_id, name, capacity, status, active, created_at, updated_at) VALUES ($1, $2, $3, 4, 'available', 1, $4, $4)",
      [
        `00000000-0000-4000-8000-00000000003${number - 1}`,
        businessId,
        `Table ${number}`,
        now,
      ],
    );
}
function mapOrder(row: Row, items: PosOrder["items"]): PosOrder {
  return {
    id: asString(row.id),
    businessId: asString(row.businessId),
    orderNumber: asNumber(row.orderNumber),
    orderType: asString(row.orderType) as OrderType,
    tableId: asNullableString(row.tableId),
    tableName: asNullableString(row.tableName),
    status: asString(row.status),
    paymentStatus: asString(row.paymentStatus),
    subtotalMinor: asNumber(row.subtotalMinor),
    totalMinor: asNumber(row.totalMinor),
    openedAt: asString(row.openedAt),
    items,
    kitchenTickets: [],
    kitchenChangesPending: false,
  };
}
async function getKitchenTickets(
  db: SqlDatabase,
  orderId: string,
): Promise<KitchenTicket[]> {
  const tickets = await select<Row>(
    db,
    "SELECT id, sequence, type, print_status AS printStatus, printed_at AS printedAt, last_print_error AS lastPrintError, print_attempt_count AS printAttemptCount, last_attempt_at AS lastAttemptAt, created_at AS createdAt FROM kitchen_tickets WHERE order_id = $1 AND business_id = $2 ORDER BY sequence",
    [orderId, businessId],
  );
  const result: KitchenTicket[] = [];
  for (const ticket of tickets) {
    const items = await select<Row>(
      db,
      "SELECT id, order_item_id AS orderItemId, item_name_snapshot AS itemName, quantity, action, notes FROM kitchen_ticket_items WHERE kitchen_ticket_id = $1 ORDER BY created_at, id",
      [asString(ticket.id)],
    );
    result.push({
      id: asString(ticket.id),
      sequence: asNumber(ticket.sequence),
      type: asString(ticket.type) as KitchenTicket["type"],
      printStatus: asString(ticket.printStatus) as KitchenTicket["printStatus"],
      printedAt: asNullableString(ticket.printedAt),
      createdAt: asString(ticket.createdAt),
      lastPrintError: asNullableString(ticket.lastPrintError),
      printAttemptCount: asNumber(ticket.printAttemptCount),
      lastAttemptAt: asNullableString(ticket.lastAttemptAt),
      items: items.map((item) => ({
        id: asString(item.id),
        orderItemId: asNullableString(item.orderItemId),
        itemName: asString(item.itemName),
        quantity: asNumber(item.quantity),
        action: asString(item.action) as "add" | "cancel",
        notes: asNullableString(item.notes),
      })),
    });
  }
  return result;
}

function mapPrinter(row: Row): PosPrinterConfig {
  return {
    id: asString(row.id),
    businessId: asString(row.businessId),
    name: asString(row.name),
    role: asString(row.role) as "kitchen" | "receipt",
    connectionType: asString(row.connectionType) as "network" | "usb",
    address: asString(row.address),
    port:
      row.port === null || row.port === undefined ? null : asNumber(row.port),
    paperWidth: asNumber(row.paperWidth) as PaperWidth,
    cutterEnabled: Boolean(asNumber(row.cutterEnabled)),
    active: Boolean(asNumber(row.active)),
  };
}

async function getActiveKitchenPrinter(
  db: SqlDatabase,
): Promise<PosPrinterConfig | null> {
  const [row] = await select<Row>(
    db,
    "SELECT id, business_id AS businessId, name, role, connection_type AS connectionType, address, port, paper_width AS paperWidth, cutter_enabled AS cutterEnabled, active FROM printers WHERE business_id = $1 AND role = 'kitchen' AND active = 1 ORDER BY created_at LIMIT 1",
    [businessId],
  );
  return row ? mapPrinter(row) : null;
}

function nativePrinterRequest(printer: PosPrinterConfig) {
  return {
    connectionType: printer.connectionType,
    address: printer.address,
    port: printer.port,
    paperWidth: printer.paperWidth,
    cutterEnabled: printer.cutterEnabled,
  };
}

async function attemptKitchenPrint(
  db: SqlDatabase,
  order: PosOrder,
  ticket: KitchenTicket,
  printer: PosPrinterConfig | null,
  reprint = false,
): Promise<void> {
  if (ticket.printStatus === "printed" && !reprint) return;
  const attemptAt = timestamp();
  await execute(
    db,
    reprint
      ? "UPDATE kitchen_tickets SET print_attempt_count = print_attempt_count + 1, last_attempt_at = $1, updated_at = $1 WHERE id = $2 AND business_id = $3"
      : "UPDATE kitchen_tickets SET print_status = 'pending', print_attempt_count = print_attempt_count + 1, last_attempt_at = $1, last_print_error = NULL, updated_at = $1 WHERE id = $2 AND business_id = $3",
    [attemptAt, ticket.id, businessId],
  );
  if (!printer) {
    await execute(
      db,
      reprint
        ? "UPDATE kitchen_tickets SET last_print_error = $1, updated_at = $2 WHERE id = $3 AND business_id = $4"
        : "UPDATE kitchen_tickets SET print_status = 'failed', last_print_error = $1, updated_at = $2 WHERE id = $3 AND business_id = $4",
      [
        "No active kitchen printer is configured.",
        attemptAt,
        ticket.id,
        businessId,
      ],
    );
    return;
  }
  const payload = {
    orderNumber: order.orderNumber,
    tableName: order.tableName,
    sequence: ticket.sequence,
    ticketType: ticket.type,
    createdAt: ticket.createdAt,
    items: ticket.items.map((item) => ({
      itemName: item.itemName,
      quantity: item.quantity,
      action: item.action,
      notes: item.notes,
    })),
  };
  try {
    await invoke("print_kitchen_ticket", {
      request: nativePrinterRequest(printer),
      ticket: payload,
    });
    await execute(
      db,
      reprint
        ? "UPDATE kitchen_tickets SET last_print_error = NULL, updated_at = $1 WHERE id = $2 AND business_id = $3"
        : "UPDATE kitchen_tickets SET print_status = 'printed', printed_at = $1, last_print_error = NULL, updated_at = $1 WHERE id = $2 AND business_id = $3",
      [attemptAt, ticket.id, businessId],
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await execute(
      db,
      reprint
        ? "UPDATE kitchen_tickets SET last_print_error = $1, updated_at = $2 WHERE id = $3 AND business_id = $4"
        : "UPDATE kitchen_tickets SET print_status = 'failed', last_print_error = $1, updated_at = $2 WHERE id = $3 AND business_id = $4",
      [message.slice(0, 500), attemptAt, ticket.id, businessId],
    );
  }
}
async function getKitchenSyncLines(
  db: SqlDatabase,
  orderId: string,
): Promise<KitchenSyncLine[]> {
  const current = await select<Row>(
    db,
    "SELECT id AS orderItemId, item_name_snapshot AS itemName, quantity, notes FROM order_items WHERE order_id = $1",
    [orderId],
  );
  const sent = await select<Row>(
    db,
    "SELECT kti.order_item_id AS orderItemId, SUM(CASE WHEN kti.action = 'add' THEN kti.quantity ELSE -kti.quantity END) AS sentQuantity FROM kitchen_ticket_items kti JOIN kitchen_tickets kt ON kt.id = kti.kitchen_ticket_id WHERE kt.order_id = $1 AND kt.business_id = $2 AND kti.order_item_id IS NOT NULL GROUP BY kti.order_item_id",
    [orderId, businessId],
  );
  const latestNotes = await select<Row>(
    db,
    "SELECT kti.order_item_id AS orderItemId, kti.item_name_snapshot AS itemName, kti.notes, kt.sequence FROM kitchen_ticket_items kti JOIN kitchen_tickets kt ON kt.id = kti.kitchen_ticket_id WHERE kt.order_id = $1 AND kt.business_id = $2 AND kti.action = 'add' AND kti.order_item_id IS NOT NULL ORDER BY kt.sequence DESC, kti.created_at DESC",
    [orderId, businessId],
  );
  const sentMap = new Map(
    sent.map((line) => [
      asString(line.orderItemId),
      asNumber(line.sentQuantity),
    ]),
  );
  const noteMap = new Map<string, { itemName: string; notes: string | null }>();
  for (const line of latestNotes) {
    const id = asString(line.orderItemId);
    if (!noteMap.has(id))
      noteMap.set(id, {
        itemName: asString(line.itemName),
        notes: asNullableString(line.notes),
      });
  }
  const currentIds = new Set(current.map((line) => asString(line.orderItemId)));
  const lines: KitchenSyncLine[] = current.map((line) => ({
    orderItemId: asString(line.orderItemId),
    itemName: asString(line.itemName),
    quantity: asNumber(line.quantity),
    notes: asNullableString(line.notes),
    sentQuantity: sentMap.get(asString(line.orderItemId)) ?? 0,
    sentNotes: noteMap.get(asString(line.orderItemId))?.notes ?? null,
  }));
  for (const [orderItemId, sentQuantity] of sentMap) {
    if (currentIds.has(orderItemId)) continue;
    const note = noteMap.get(orderItemId);
    if (note)
      lines.push({
        orderItemId,
        itemName: note.itemName,
        quantity: 0,
        notes: null,
        sentQuantity,
        sentNotes: note.notes,
      });
  }
  return lines;
}
async function getOrder(db: SqlDatabase, orderId: string): Promise<PosOrder> {
  const [order] = await select<Row>(
    db,
    "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.id = $1 AND o.business_id = $2",
    [orderId, businessId],
  );
  if (!order) throw new PosClientError("not_found", "Order not found.");
  const rows = await select<Row>(
    db,
    "SELECT id, menu_item_id AS menuItemId, item_name_snapshot AS name, unit_price_minor_snapshot AS unitPriceMinor, quantity, line_total_minor AS lineTotalMinor, notes FROM order_items WHERE order_id = $1 ORDER BY created_at, id",
    [orderId],
  );
  const orderResult = mapOrder(
    order,
    rows.map((row) => ({
      id: asString(row.id),
      menuItemId: asNullableString(row.menuItemId),
      name: asString(row.name),
      unitPriceMinor: asNumber(row.unitPriceMinor),
      quantity: asNumber(row.quantity),
      lineTotalMinor: asNumber(row.lineTotalMinor),
      notes: asNullableString(row.notes),
    })),
  );
  orderResult.kitchenTickets = await getKitchenTickets(db, orderId);
  orderResult.kitchenChangesPending =
    calculateKitchenDeltas(
      await getKitchenSyncLines(db, orderId),
      orderResult.kitchenTickets.length > 0,
    ).length > 0;
  return orderResult;
}
async function recalculateTotals(
  db: SqlDatabase,
  orderId: string,
): Promise<void> {
  const lines = await select<Row>(
    db,
    "SELECT unit_price_minor_snapshot AS unitPriceMinor, quantity FROM order_items WHERE order_id = $1",
    [orderId],
  );
  const totals = calculateOrderTotals(
    lines.map((line) => ({
      unitPriceMinor: money(asNumber(line.unitPriceMinor)),
      quantity: asNumber(line.quantity),
    })),
  );
  await execute(
    db,
    "UPDATE orders SET subtotal_minor = $1, total_minor = $2, updated_at = $3 WHERE id = $4",
    [totals.subtotalMinor, totals.totalMinor, timestamp(), orderId],
  );
}

/** Native-only adapter. Fixed operations are the only SQL sent through Tauri. */
export function createTauriClient(): PosClient {
  return {
    async bootstrap(): Promise<PosBootstrap> {
      const db = await database();
      await ensureBootstrap(db);
      const categories = await select<Row>(
        db,
        "SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE business_id = $1 AND active = 1 ORDER BY sort_order, name",
        [businessId],
      );
      const items = await select<Row>(
        db,
        "SELECT i.id, i.category_id AS categoryId, i.name, i.description, i.selling_price_minor AS sellingPriceMinor FROM menu_items i JOIN menu_categories c ON c.id = i.category_id WHERE i.business_id = $1 AND i.active = 1 AND i.available = 1 AND c.active = 1 ORDER BY i.name",
        [businessId],
      );
      const tables = await select<Row>(
        db,
        "SELECT t.id, t.name, t.capacity, CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.business_id = t.business_id AND o.order_type = 'dine_in' AND o.status IN ('open', 'sent_to_kitchen', 'preparing', 'ready')) THEN 'occupied' ELSE t.status END AS status FROM restaurant_tables t WHERE t.business_id = $1 AND t.active = 1 ORDER BY t.name",
        [businessId],
      );
      const openOrders = await select<Row>(
        db,
        "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.business_id = $1 AND o.status IN ('open', 'sent_to_kitchen', 'preparing') ORDER BY o.opened_at DESC, o.order_number DESC",
        [businessId],
      );
      return {
        businessId,
        createdBy,
        categories: categories.map((row) => ({
          id: asString(row.id),
          name: asString(row.name),
          sortOrder: asNumber(row.sortOrder),
        })),
        items: items.map((row) => ({
          id: asString(row.id),
          categoryId: asString(row.categoryId),
          name: asString(row.name),
          description: asNullableString(row.description),
          sellingPriceMinor: asNumber(row.sellingPriceMinor),
        })),
        tables: tables.map((row) => ({
          id: asString(row.id),
          name: asString(row.name),
          capacity: asNumber(row.capacity),
          status: asString(row.status) as "available" | "occupied" | "reserved",
        })),
        openOrders: openOrders.map((row) => mapOrder(row, [])),
      };
    },
    async addMenuItem(input) {
      if (!input.menuItemId)
        throw new PosClientError("validation", "A menu item is required.");
      if (input.orderType === "dine_in" && !input.tableId && !input.orderId)
        throw new PosClientError(
          "validation",
          "Select a table for a dine-in order.",
        );
      if (input.orderType === "takeaway" && input.tableId)
        throw new PosClientError(
          "validation",
          "Takeaway orders cannot have a table.",
        );
      const db = await database();
      const [menuItem] = await select<Row>(
        db,
        "SELECT id, name, selling_price_minor AS sellingPriceMinor FROM menu_items WHERE id = $1 AND business_id = $2 AND active = 1 AND available = 1",
        [input.menuItemId, businessId],
      );
      if (!menuItem)
        throw new PosClientError(
          "unavailable",
          "This menu item is unavailable.",
        );
      await execute(db, "BEGIN IMMEDIATE");
      try {
        let orderId = input.orderId;
        if (!orderId) {
          if (input.tableId) {
            const tables = await select<Row>(
              db,
              "SELECT id FROM restaurant_tables WHERE id = $1 AND business_id = $2 AND active = 1",
              [input.tableId, businessId],
            );
            if (!tables[0])
              throw new PosClientError(
                "not_found",
                "The selected table is unavailable.",
              );
          }
          const [next] = await select<Row>(
            db,
            "SELECT COALESCE(MAX(order_number), 0) + 1 AS nextNumber FROM orders WHERE business_id = $1",
            [businessId],
          );
          orderId = crypto.randomUUID();
          const now = timestamp();
          await execute(
            db,
            "INSERT INTO orders (id, business_id, order_number, order_type, table_id, created_by, status, payment_status, subtotal_minor, discount_minor, total_minor, opened_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'open', 'unpaid', 0, 0, 0, $7, $7, $7)",
            [
              orderId,
              businessId,
              asNumber(next?.nextNumber),
              input.orderType,
              input.tableId ?? null,
              createdBy,
              now,
            ],
          );
        }
        const [existingOrder] = await select<Row>(
          db,
          "SELECT id, status FROM orders WHERE id = $1 AND business_id = $2 AND status IN ('open', 'sent_to_kitchen', 'preparing')",
          [orderId, businessId],
        );
        if (!existingOrder)
          throw new PosClientError(
            "invalid_state",
            "This order can no longer be changed.",
          );
        const [existing] = await select<Row>(
          db,
          "SELECT id, quantity, unit_price_minor_snapshot AS unitPriceMinor FROM order_items WHERE order_id = $1 AND menu_item_id = $2 AND notes IS NULL",
          [orderId, input.menuItemId],
        );
        if (existing) {
          const quantity = asNumber(existing.quantity) + 1;
          await execute(
            db,
            "UPDATE order_items SET quantity = $1, line_total_minor = $2, updated_at = $3 WHERE id = $4",
            [
              quantity,
              multiplyMoney(money(asNumber(existing.unitPriceMinor)), quantity),
              timestamp(),
              asString(existing.id),
            ],
          );
        } else {
          const now = timestamp();
          await execute(
            db,
            "INSERT INTO order_items (id, business_id, order_id, menu_item_id, item_name_snapshot, unit_price_minor_snapshot, quantity, line_total_minor, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 1, $6, $7, $7)",
            [
              crypto.randomUUID(),
              businessId,
              orderId,
              asString(menuItem.id),
              asString(menuItem.name),
              asNumber(menuItem.sellingPriceMinor),
              now,
            ],
          );
        }
        await recalculateTotals(db, orderId);
        await execute(db, "COMMIT");
        return await getOrder(db, orderId);
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
    },
    async getOrder(orderId) {
      if (!orderId)
        throw new PosClientError("validation", "An order ID is required.");
      return getOrder(await database(), orderId);
    },
    async updateOrderItemQuantity(orderId, itemId, quantity) {
      if (!Number.isSafeInteger(quantity) || quantity < 0)
        throw new PosClientError(
          "validation",
          "Quantity must be a non-negative whole number.",
        );
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        const [item] = await select<Row>(
          db,
          "SELECT oi.id, oi.unit_price_minor_snapshot AS unitPriceMinor FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 AND oi.order_id = $2 AND o.business_id = $3 AND o.status IN ('open', 'sent_to_kitchen', 'preparing')",
          [itemId, orderId, businessId],
        );
        if (!item)
          throw new PosClientError("not_found", "Order item is unavailable.");
        if (quantity === 0)
          await execute(db, "DELETE FROM order_items WHERE id = $1", [itemId]);
        else
          await execute(
            db,
            "UPDATE order_items SET quantity = $1, line_total_minor = $2, updated_at = $3 WHERE id = $4",
            [
              quantity,
              multiplyMoney(money(asNumber(item.unitPriceMinor)), quantity),
              timestamp(),
              itemId,
            ],
          );
        await recalculateTotals(db, orderId);
        await execute(db, "COMMIT");
        return await getOrder(db, orderId);
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
    },
    async updateOrderItemNote(orderId, itemId, notes) {
      if (notes.length > 500)
        throw new PosClientError(
          "validation",
          "Item notes must be 500 characters or fewer.",
        );
      const db = await database();
      await execute(
        db,
        "UPDATE order_items SET notes = $1, updated_at = $2 WHERE id = $3 AND order_id = $4 AND EXISTS (SELECT 1 FROM orders WHERE id = $4 AND business_id = $5 AND status IN ('open', 'sent_to_kitchen', 'preparing'))",
        [notes.trim() || null, timestamp(), itemId, orderId, businessId],
      );
      return getOrder(db, orderId);
    },
    async removeOrderItem(orderId, itemId) {
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        await execute(
          db,
          "DELETE FROM order_items WHERE id = $1 AND order_id = $2 AND EXISTS (SELECT 1 FROM orders WHERE id = $2 AND business_id = $3 AND status IN ('open', 'sent_to_kitchen', 'preparing'))",
          [itemId, orderId, businessId],
        );
        await recalculateTotals(db, orderId);
        await execute(db, "COMMIT");
        return getOrder(db, orderId);
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
    },
    async sendOrderToKitchen(orderId) {
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        const [order] = await select<Row>(
          db,
          "SELECT id, status FROM orders WHERE id = $1 AND business_id = $2 AND status IN ('open', 'sent_to_kitchen', 'preparing')",
          [orderId, businessId],
        );
        if (!order)
          throw new PosClientError(
            "invalid_state",
            "Only an active order can be sent to the kitchen.",
          );
        const [user] = await select<Row>(
          db,
          "SELECT id FROM users WHERE id = $1 AND business_id = $2 AND active = 1",
          [createdBy, businessId],
        );
        if (!user)
          throw new PosClientError(
            "not_found",
            "The sending user is unavailable.",
          );
        const priorTickets = await getKitchenTickets(db, orderId);
        const deltas = calculateKitchenDeltas(
          await getKitchenSyncLines(db, orderId),
          priorTickets.length > 0,
        );
        if (deltas.length === 0) {
          await execute(db, "COMMIT");
          return getOrder(db, orderId);
        }
        const [sequenceRow] = await select<Row>(
          db,
          "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM kitchen_tickets WHERE order_id = $1",
          [orderId],
        );
        let sequence = asNumber(sequenceRow?.sequence) || 1;
        const newTicketIds: string[] = [];
        for (const delta of deltas) {
          const ticketId = crypto.randomUUID();
          newTicketIds.push(ticketId);
          const createdAt = timestamp();
          await execute(
            db,
            "INSERT INTO kitchen_tickets (id, business_id, order_id, sequence, type, created_by, print_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7)",
            [
              ticketId,
              businessId,
              orderId,
              sequence++,
              delta.type,
              createdBy,
              createdAt,
            ],
          );
          for (const item of delta.items)
            await execute(
              db,
              "INSERT INTO kitchen_ticket_items (id, business_id, kitchen_ticket_id, order_item_id, item_name_snapshot, quantity, action, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
              [
                crypto.randomUUID(),
                businessId,
                ticketId,
                item.orderItemId,
                item.itemName,
                item.quantity,
                item.action,
                item.notes,
                createdAt,
              ],
            );
        }
        await execute(
          db,
          "UPDATE orders SET status = CASE WHEN status = 'open' THEN 'sent_to_kitchen' ELSE status END, updated_at = $1 WHERE id = $2 AND business_id = $3",
          [timestamp(), orderId, businessId],
        );
        await execute(db, "COMMIT");
        const committed = await getOrder(db, orderId);
        const printer = await getActiveKitchenPrinter(db);
        for (const ticket of committed.kitchenTickets.filter((ticket) =>
          newTicketIds.includes(ticket.id),
        ))
          await attemptKitchenPrint(db, committed, ticket, printer);
        return getOrder(db, orderId);
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
    },
    async listPrinters() {
      const db = await database();
      const rows = await select<Row>(
        db,
        "SELECT id, business_id AS businessId, name, role, connection_type AS connectionType, address, port, paper_width AS paperWidth, cutter_enabled AS cutterEnabled, active FROM printers WHERE business_id = $1 ORDER BY role, name",
        [businessId],
      );
      return rows.map(mapPrinter);
    },
    async savePrinter(input) {
      if (!input.name.trim() || !input.address.trim())
        throw new PosClientError(
          "validation",
          "Printer name and address are required.",
        );
      if (
        input.connectionType === "network" &&
        (!input.port || input.port < 1 || input.port > 65535)
      )
        throw new PosClientError(
          "validation",
          "A network printer needs a valid port.",
        );
      if (input.paperWidth !== 58 && input.paperWidth !== 80)
        throw new PosClientError(
          "validation",
          "Paper width must be 58mm or 80mm.",
        );
      const db = await database();
      const id = input.id ?? crypto.randomUUID();
      const now = timestamp();
      await execute(
        db,
        "INSERT INTO printers (id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at) VALUES ($1, $2, $3, 'kitchen', $4, $5, $6, $7, $8, $9, $10, $10) ON CONFLICT(id) DO UPDATE SET name = excluded.name, connection_type = excluded.connection_type, address = excluded.address, port = excluded.port, paper_width = excluded.paper_width, cutter_enabled = excluded.cutter_enabled, active = excluded.active, updated_at = excluded.updated_at WHERE printers.business_id = excluded.business_id",
        [
          id,
          businessId,
          input.name.trim(),
          input.connectionType,
          input.address.trim(),
          input.port,
          input.paperWidth,
          input.cutterEnabled ? 1 : 0,
          input.active ? 1 : 0,
          now,
        ],
      );
      const printers = await this.listPrinters();
      const saved = printers.find((printer) => printer.id === id);
      if (!saved)
        throw new PosClientError("database", "Printer could not be saved.");
      return saved;
    },
    async testPrinter(printerId) {
      const db = await database();
      const [row] = await select<Row>(
        db,
        "SELECT id, business_id AS businessId, name, role, connection_type AS connectionType, address, port, paper_width AS paperWidth, cutter_enabled AS cutterEnabled, active FROM printers WHERE id = $1 AND business_id = $2",
        [printerId, businessId],
      );
      if (!row) throw new PosClientError("not_found", "Printer not found.");
      const printer = mapPrinter(row);
      if (!printer.active)
        throw new PosClientError("invalid_state", "Printer is disabled.");
      try {
        await invoke("test_printer", {
          request: nativePrinterRequest(printer),
          createdAt: timestamp(),
        });
      } catch (cause) {
        throw new PosClientError("database", String(cause));
      }
    },
    async retryPendingKitchenPrints() {
      const db = await database();
      const rows = await select<Row>(
        db,
        "SELECT DISTINCT order_id AS orderId FROM kitchen_tickets WHERE business_id = $1 AND print_status <> 'printed' ORDER BY order_id",
        [businessId],
      );
      const printer = await getActiveKitchenPrinter(db);
      const orders: PosOrder[] = [];
      for (const row of rows) {
        const order = await getOrder(db, asString(row.orderId));
        for (const ticket of order.kitchenTickets)
          if (ticket.printStatus !== "printed")
            await attemptKitchenPrint(db, order, ticket, printer);
        orders.push(await getOrder(db, order.id));
      }
      return orders;
    },
    async reprintKitchenTicket(orderId, ticketId) {
      const db = await database();
      const order = await getOrder(db, orderId);
      const ticket = order.kitchenTickets.find(
        (entry) => entry.id === ticketId,
      );
      if (!ticket)
        throw new PosClientError("not_found", "Kitchen ticket not found.");
      const printer = await getActiveKitchenPrinter(db);
      await attemptKitchenPrint(db, order, ticket, printer, true);
    },
  };
}
