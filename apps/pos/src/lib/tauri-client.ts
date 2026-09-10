import Database from "@tauri-apps/plugin-sql";
import { serializeClient } from "./serialize-client";
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
  InventoryItem,
  InventoryUnit,
  StockMovement,
  PosClient,
  PosOrder,
  PosPayment,
  PosReceipt,
  PosPrinterConfig,
  MenuManagementData,
  MenuManagementItem,
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
function errorDetail(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
function databaseWriteMessage(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.includes("locked") || normalized.includes("busy"))
    return "Local database is busy. Close other ATE05 windows and try again.";
  if (normalized.includes("readonly") || normalized.includes("read-only"))
    return "Local database is read-only. Check the app data folder permissions.";
  if (
    normalized.includes("no such table") ||
    normalized.includes("no such column") ||
    normalized.includes("migration")
  )
    return "Local database schema is out of date. Restart ATE05 to apply migrations.";
  return "Local database could not save this change.";
}
function reportDatabaseFailure(
  operation: string,
  cause: unknown,
): PosClientError {
  const detail = errorDetail(cause);
  console.error("[ATE05] local database write failed", {
    operation,
    detail,
  });
  const message = databaseWriteMessage(detail);
  return new PosClientError(
    "database",
    import.meta.env.DEV && detail ? `${message} (${detail})` : message,
  );
}
function inventoryState(
  quantity: number,
  threshold: number | null,
): InventoryItem["stockState"] {
  if (quantity === 0) return "out_of_stock";
  if (threshold !== null && quantity <= threshold) return "low_stock";
  return "in_stock";
}
function mapInventory(row: Row): InventoryItem {
  const currentQuantity = asNumber(row.currentQuantity);
  const reorderThreshold =
    row.reorderThreshold == null ? null : asNumber(row.reorderThreshold);
  return {
    id: asString(row.id),
    name: asString(row.name),
    unit: asString(row.unit) as InventoryUnit,
    currentQuantity,
    reorderThreshold,
    active: Boolean(asNumber(row.active)),
    stockState: inventoryState(currentQuantity, reorderThreshold),
  };
}
function mapStockMovement(row: Row): StockMovement {
  return {
    id: asString(row.id),
    inventoryItemId: asString(row.inventoryItemId),
    type: asString(row.type) as StockMovement["type"],
    quantityDelta: asNumber(row.quantityDelta),
    balanceAfter: asNumber(row.balanceAfter),
    reason: asNullableString(row.reason),
    createdBy: asNullableString(row.createdBy),
    createdAt: asString(row.createdAt),
  };
}
function mapMenuManagement(row: Row): MenuManagementItem {
  return {
    id: asString(row.id),
    categoryId: asString(row.categoryId),
    categoryName: asString(row.categoryName),
    name: asString(row.name),
    description: asNullableString(row.description),
    sellingPriceMinor: asNumber(row.sellingPriceMinor),
    available: Boolean(asNumber(row.available)),
    active: Boolean(asNumber(row.active)),
    updatedAt: asString(row.updatedAt),
  };
}
async function listMenuManagementRows(
  db: SqlDatabase,
): Promise<MenuManagementData> {
  const [categories, items] = await Promise.all([
    select<Row>(
      db,
      "SELECT id, name, sort_order AS sortOrder, active FROM menu_categories WHERE business_id = $1 ORDER BY active DESC, sort_order, name",
      [businessId],
    ),
    select<Row>(
      db,
      "SELECT i.id, i.category_id AS categoryId, c.name AS categoryName, i.name, i.description, i.selling_price_minor AS sellingPriceMinor, i.available, i.active, i.updated_at AS updatedAt FROM menu_items i JOIN menu_categories c ON c.id = i.category_id WHERE i.business_id = $1 ORDER BY i.active DESC, i.name",
      [businessId],
    ),
  ]);
  return {
    categories: categories.map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      sortOrder: asNumber(row.sortOrder),
      active: Boolean(asNumber(row.active)),
    })),
    items: items.map(mapMenuManagement),
  };
}
async function database(): Promise<SqlDatabase> {
  // Rust preloads/migrates and configures the pool. load() would replace it.
  databasePromise ??= Promise.resolve(Database.get(databaseUrl));
  return databasePromise;
}
async function listInventoryRows(db: SqlDatabase): Promise<InventoryItem[]> {
  const rows = await select<Row>(
    db,
    "SELECT id, name, unit, current_quantity AS currentQuantity, reorder_threshold AS reorderThreshold, active FROM inventory_items WHERE business_id = $1 ORDER BY active DESC, name",
    [businessId],
  );
  return rows.map(mapInventory);
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
  } catch (cause) {
    throw reportDatabaseFailure(sql.replace(/\s+/g, " ").slice(0, 160), cause);
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
    amountPaidMinor: asNumber(row.amountPaidMinor),
    amountDueMinor: Math.max(
      0,
      asNumber(row.totalMinor) - asNumber(row.amountPaidMinor),
    ),
    receipt: null,
    openedAt: asString(row.openedAt),
    items,
    kitchenTickets: [],
    kitchenChangesPending: false,
  };
}

function mapPayment(row: Row): PosPayment {
  return {
    id: asString(row.id),
    amountMinor: asNumber(row.amountMinor),
    method: asString(row.method) as PosPayment["method"],
    reference: asNullableString(row.reference),
    cashTenderedMinor:
      row.cashTenderedMinor == null ? null : asNumber(row.cashTenderedMinor),
    changeMinor: row.changeMinor == null ? null : asNumber(row.changeMinor),
  };
}

function mapReceipt(
  row: Row,
  snapshot: { items?: PosOrder["items"]; payments?: PosPayment[] },
): PosReceipt {
  return {
    id: asString(row.id),
    receiptNumber: asNumber(row.receiptNumber),
    totalMinor: asNumber(row.totalMinor),
    issuedAt: asString(row.issuedAt),
    printStatus: asString(row.printStatus) as PosReceipt["printStatus"],
    printedAt: asNullableString(row.printedAt),
    lastPrintError: asNullableString(row.lastPrintError),
    items: snapshot.items ?? [],
    payments: snapshot.payments ?? [],
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

async function getActiveReceiptPrinter(
  db: SqlDatabase,
): Promise<PosPrinterConfig | null> {
  const [row] = await select<Row>(
    db,
    "SELECT id, business_id AS businessId, name, role, connection_type AS connectionType, address, port, paper_width AS paperWidth, cutter_enabled AS cutterEnabled, active FROM printers WHERE business_id = $1 AND role = 'receipt' AND active = 1 ORDER BY updated_at DESC LIMIT 1",
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

async function attemptReceiptPrint(
  db: SqlDatabase,
  receipt: PosReceipt,
  order: PosOrder,
  printer: PosPrinterConfig | null,
  reprint = false,
): Promise<void> {
  const attemptedAt = timestamp();
  await execute(
    db,
    reprint
      ? "UPDATE receipts SET print_attempt_count = print_attempt_count + 1, last_attempt_at = $1 WHERE id = $2 AND business_id = $3"
      : "UPDATE receipts SET print_status = 'pending', print_attempt_count = print_attempt_count + 1, last_attempt_at = $1, last_print_error = NULL WHERE id = $2 AND business_id = $3",
    [attemptedAt, receipt.id, businessId],
  );
  const failure = async (message: string) =>
    execute(
      db,
      reprint
        ? "UPDATE receipts SET last_print_error = $1 WHERE id = $2 AND business_id = $3"
        : "UPDATE receipts SET print_status = 'failed', last_print_error = $1 WHERE id = $2 AND business_id = $3",
      [message, receipt.id, businessId],
    );
  if (!printer) {
    await failure("No active receipt printer is configured.");
    return;
  }
  try {
    await invoke("print_receipt", {
      request: nativePrinterRequest(printer),
      receipt: {
        businessName: "ATE05",
        receiptNumber: receipt.receiptNumber,
        orderNumber: order.orderNumber,
        issuedAt: receipt.issuedAt,
        tableName: order.tableName,
        items: receipt.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotalMinor: item.lineTotalMinor,
        })),
        subtotalMinor: order.subtotalMinor,
        totalMinor: receipt.totalMinor,
        payments: receipt.payments.map((payment) => ({
          method: payment.method,
          amountMinor: payment.amountMinor,
        })),
      },
    });
    await execute(
      db,
      reprint
        ? "UPDATE receipts SET last_print_error = NULL WHERE id = $1 AND business_id = $2"
        : "UPDATE receipts SET print_status = 'printed', printed_at = $1, last_print_error = NULL WHERE id = $2 AND business_id = $3",
      reprint
        ? [receipt.id, businessId]
        : [attemptedAt, receipt.id, businessId],
    );
  } catch (cause) {
    await failure(String(cause).slice(0, 500));
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
    "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt, COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.order_id = o.id AND p.business_id = o.business_id AND p.status = 'recorded'), 0) AS amountPaidMinor FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.id = $1 AND o.business_id = $2",
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
  const [receipt] = await select<Row>(
    db,
    "SELECT id, receipt_number AS receiptNumber, total_minor AS totalMinor, issued_at AS issuedAt, print_status AS printStatus, printed_at AS printedAt, last_print_error AS lastPrintError, snapshot FROM receipts WHERE order_id = $1 AND business_id = $2",
    [orderId, businessId],
  );
  if (receipt) {
    let snapshot: { items?: PosOrder["items"]; payments?: PosPayment[] } = {};
    try {
      snapshot = JSON.parse(asString(receipt.snapshot)) as typeof snapshot;
    } catch {
      snapshot = {};
    }
    orderResult.receipt = mapReceipt(receipt, snapshot);
  }
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

async function recordInventoryMovementNative(
  db: SqlDatabase,
  itemId: string,
  type: StockMovement["type"],
  delta: number,
  reason: string | null,
): Promise<InventoryItem> {
  if (!Number.isSafeInteger(delta) || delta === 0)
    throw new PosClientError(
      "validation",
      "Quantity must be a non-zero whole number.",
    );
  if ((type === "waste" || type === "adjustment") && !reason?.trim())
    throw new PosClientError(
      "validation",
      "A reason is required for this movement.",
    );
  await execute(db, "BEGIN IMMEDIATE");
  try {
    const [item] = await select<Row>(
      db,
      "SELECT id, current_quantity AS currentQuantity, unit, active FROM inventory_items WHERE id = $1 AND business_id = $2",
      [itemId, businessId],
    );
    if (!item)
      throw new PosClientError("not_found", "Inventory item not found.");
    if (!asNumber(item.active))
      throw new PosClientError("invalid_state", "Inventory item is inactive.");
    const current = asNumber(item.currentQuantity);
    const next = current + delta;
    if (next < 0)
      throw new PosClientError(
        "validation",
        "Only " + current + " " + asString(item.unit) + " is available.",
      );
    const now = timestamp();
    await execute(
      db,
      "INSERT INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        crypto.randomUUID(),
        businessId,
        itemId,
        type,
        delta,
        next,
        reason?.trim() || null,
        createdBy,
        now,
      ],
    );
    await execute(
      db,
      "UPDATE inventory_items SET current_quantity = $1, updated_at = $2 WHERE id = $3 AND business_id = $4",
      [next, now, itemId, businessId],
    );
    await execute(db, "COMMIT");
  } catch (error) {
    await execute(db, "ROLLBACK");
    throw error;
  }
  const items = await listInventoryRows(db);
  const result = items.find((item) => item.id === itemId);
  if (!result)
    throw new PosClientError("not_found", "Inventory item not found.");
  return result;
}

/** Native-only adapter. Fixed operations are the only SQL sent through Tauri. */
export function createTauriClient(): PosClient {
  const client: PosClient = {
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
        "SELECT o.id, o.business_id AS businessId, o.order_number AS orderNumber, o.order_type AS orderType, o.table_id AS tableId, t.name AS tableName, o.status, o.payment_status AS paymentStatus, o.subtotal_minor AS subtotalMinor, o.total_minor AS totalMinor, o.opened_at AS openedAt, COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.order_id = o.id AND p.business_id = o.business_id AND p.status = 'recorded'), 0) AS amountPaidMinor FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.business_id = $1 AND o.status IN ('open', 'sent_to_kitchen', 'preparing', 'completed') ORDER BY o.opened_at DESC, o.order_number DESC",
        [businessId],
      );
      const inventory = await listInventoryRows(db);
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
        inventory,
      };
    },
    async listMenuManagement() {
      return listMenuManagementRows(await database());
    },
    async createMenuItem(input) {
      if (!input.name.trim())
        throw new PosClientError("validation", "Menu item name is required.");
      if (
        !Number.isSafeInteger(input.sellingPriceMinor) ||
        input.sellingPriceMinor < 0
      )
        throw new PosClientError(
          "validation",
          "Price must be a valid non-negative amount.",
        );
      const db = await database();
      const id = crypto.randomUUID();
      const now = timestamp();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        const [category] = await select<Row>(
          db,
          "SELECT id FROM menu_categories WHERE id = $1 AND business_id = $2 AND active = 1",
          [input.categoryId, businessId],
        );
        if (!category)
          throw new PosClientError(
            "validation",
            "The selected category is unavailable.",
          );
        await execute(
          db,
          "INSERT INTO menu_items (id, business_id, category_id, name, description, selling_price_minor, available, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)",
          [
            id,
            businessId,
            input.categoryId,
            input.name.trim(),
            input.description?.trim() || null,
            input.sellingPriceMinor,
            input.available ? 1 : 0,
            input.active ? 1 : 0,
            now,
          ],
        );
        await execute(db, "COMMIT");
      } catch (cause) {
        await execute(db, "ROLLBACK").catch(() => undefined);
        throw cause;
      }
      const data = await listMenuManagementRows(db);
      const item = data.items.find((entry) => entry.id === id);
      if (!item)
        throw new PosClientError("database", "Menu item could not be saved.");
      return item;
    },
    async updateMenuItem(input) {
      if (!input.name.trim())
        throw new PosClientError("validation", "Menu item name is required.");
      if (
        !Number.isSafeInteger(input.sellingPriceMinor) ||
        input.sellingPriceMinor < 0
      )
        throw new PosClientError(
          "validation",
          "Price must be a valid non-negative amount.",
        );
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        const [category] = await select<Row>(
          db,
          "SELECT id FROM menu_categories WHERE id = $1 AND business_id = $2 AND active = 1",
          [input.categoryId, businessId],
        );
        if (!category)
          throw new PosClientError(
            "validation",
            "The selected category is unavailable.",
          );
        await execute(
          db,
          "UPDATE menu_items SET name = $1, description = $2, category_id = $3, selling_price_minor = $4, available = $5, active = $6, updated_at = $7 WHERE id = $8 AND business_id = $9",
          [
            input.name.trim(),
            input.description?.trim() || null,
            input.categoryId,
            input.sellingPriceMinor,
            input.available ? 1 : 0,
            input.active ? 1 : 0,
            timestamp(),
            input.id,
            businessId,
          ],
        );
        await execute(db, "COMMIT");
      } catch (cause) {
        await execute(db, "ROLLBACK").catch(() => undefined);
        throw cause;
      }
      const item = (await listMenuManagementRows(db)).items.find(
        (entry) => entry.id === input.id,
      );
      if (!item) throw new PosClientError("not_found", "Menu item not found.");
      return item;
    },
    async createMenuCategory(name) {
      if (!name.trim())
        throw new PosClientError("validation", "Category name is required.");
      const db = await database();
      const id = crypto.randomUUID();
      const now = timestamp();
      const [next] = await select<Row>(
        db,
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM menu_categories WHERE business_id = $1",
        [businessId],
      );
      await execute(
        db,
        "INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES ($1, $2, $3, $4, 1, $5, $5)",
        [id, businessId, name.trim(), asNumber(next?.sortOrder), now],
      );
      return { id, name: name.trim(), sortOrder: asNumber(next?.sortOrder) };
    },
    async updateMenuCategory(input) {
      if (!input.name.trim())
        throw new PosClientError("validation", "Category name is required.");
      const db = await database();
      if (!input.active) {
        const [activeItem] = await select<Row>(
          db,
          "SELECT 1 FROM menu_items WHERE category_id = $1 AND business_id = $2 AND active = 1 LIMIT 1",
          [input.id, businessId],
        );
        if (activeItem)
          throw new PosClientError(
            "invalid_state",
            "Deactivate or reassign active items before disabling this category.",
          );
      }
      await execute(
        db,
        "UPDATE menu_categories SET name = $1, active = $2, updated_at = $3 WHERE id = $4 AND business_id = $5",
        [
          input.name.trim(),
          input.active ? 1 : 0,
          timestamp(),
          input.id,
          businessId,
        ],
      );
      const [category] = await select<Row>(
        db,
        "SELECT id, name, sort_order AS sortOrder FROM menu_categories WHERE id = $1 AND business_id = $2",
        [input.id, businessId],
      );
      if (!category)
        throw new PosClientError("not_found", "Category not found.");
      return {
        id: asString(category.id),
        name: asString(category.name),
        sortOrder: asNumber(category.sortOrder),
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
        "INSERT INTO printers (id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, connection_type = excluded.connection_type, address = excluded.address, port = excluded.port, paper_width = excluded.paper_width, cutter_enabled = excluded.cutter_enabled, active = excluded.active, updated_at = excluded.updated_at WHERE printers.business_id = excluded.business_id",
        [
          id,
          businessId,
          input.name.trim(),
          input.role ?? "kitchen",
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
    async recordPayment(input) {
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
        throw new PosClientError(
          "validation",
          "Payment amount must be positive.",
        );
      if (!input.idempotencyKey)
        throw new PosClientError(
          "validation",
          "Payment submission is missing its operation key.",
        );
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      let receiptCreated = false;
      try {
        const [duplicate] = await select<Row>(
          db,
          "SELECT id FROM payments WHERE business_id = $1 AND idempotency_key = $2",
          [businessId, input.idempotencyKey],
        );
        if (duplicate) {
          await execute(db, "COMMIT");
          return getOrder(db, input.orderId);
        }
        const [orderRow] = await select<Row>(
          db,
          "SELECT id, order_number AS orderNumber, order_type AS orderType, table_id AS tableId, status, subtotal_minor AS subtotalMinor, total_minor AS totalMinor FROM orders WHERE id = $1 AND business_id = $2",
          [input.orderId, businessId],
        );
        if (!orderRow)
          throw new PosClientError("not_found", "Order not found.");
        const [paidRow] = await select<Row>(
          db,
          "SELECT COALESCE(SUM(amount_minor), 0) AS amountPaidMinor FROM payments WHERE order_id = $1 AND business_id = $2 AND status = 'recorded'",
          [input.orderId, businessId],
        );
        const due = Math.max(
          0,
          asNumber(orderRow.totalMinor) - asNumber(paidRow?.amountPaidMinor),
        );
        if (due <= 0)
          throw new PosClientError(
            "invalid_state",
            "This order is already paid.",
          );
        if (input.amountMinor > due)
          throw new PosClientError(
            "validation",
            "Payment cannot exceed the amount due.",
          );
        const tendered =
          input.method === "cash"
            ? (input.cashTenderedMinor ?? input.amountMinor)
            : null;
        if (
          tendered !== null &&
          (!Number.isSafeInteger(tendered) || tendered < input.amountMinor)
        )
          throw new PosClientError(
            "validation",
            "Cash tendered must cover the payment.",
          );
        const change = tendered === null ? null : tendered - input.amountMinor;
        const now = timestamp();
        await execute(
          db,
          "INSERT INTO payments (id, business_id, order_id, amount_minor, method, status, reference, cash_tendered_minor, change_minor, idempotency_key, received_by, received_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'recorded', $6, $7, $8, $9, $10, $11, $11, $11)",
          [
            crypto.randomUUID(),
            businessId,
            input.orderId,
            input.amountMinor,
            input.method,
            input.reference?.trim() || null,
            tendered,
            change,
            input.idempotencyKey,
            createdBy,
            now,
          ],
        );
        const nextPaid = asNumber(paidRow?.amountPaidMinor) + input.amountMinor;
        const nextStatus =
          nextPaid === asNumber(orderRow.totalMinor)
            ? "paid"
            : "partially_paid";
        await execute(
          db,
          "UPDATE orders SET payment_status = $1, updated_at = $2 WHERE id = $3 AND business_id = $4",
          [nextStatus, now, input.orderId, businessId],
        );
        if (nextStatus === "paid") {
          const [existingReceipt] = await select<Row>(
            db,
            "SELECT id FROM receipts WHERE order_id = $1 AND business_id = $2",
            [input.orderId, businessId],
          );
          if (!existingReceipt) {
            const [numberRow] = await select<Row>(
              db,
              "SELECT COALESCE(MAX(receipt_number), 0) + 1 AS nextNumber FROM receipts WHERE business_id = $1",
              [businessId],
            );
            const itemRows = await select<Row>(
              db,
              "SELECT id, menu_item_id AS menuItemId, item_name_snapshot AS name, unit_price_minor_snapshot AS unitPriceMinor, quantity, line_total_minor AS lineTotalMinor, notes FROM order_items WHERE order_id = $1 ORDER BY created_at, id",
              [input.orderId],
            );
            const paymentRows = await select<Row>(
              db,
              "SELECT id, amount_minor AS amountMinor, method, reference, cash_tendered_minor AS cashTenderedMinor, change_minor AS changeMinor FROM payments WHERE order_id = $1 AND business_id = $2 AND status = 'recorded' ORDER BY received_at, created_at",
              [input.orderId, businessId],
            );
            const snapshot = {
              items: itemRows.map((row) => ({
                id: asString(row.id),
                menuItemId: asNullableString(row.menuItemId),
                name: asString(row.name),
                unitPriceMinor: asNumber(row.unitPriceMinor),
                quantity: asNumber(row.quantity),
                lineTotalMinor: asNumber(row.lineTotalMinor),
                notes: asNullableString(row.notes),
              })),
              payments: paymentRows.map(mapPayment),
            };
            await execute(
              db,
              "INSERT INTO receipts (id, business_id, order_id, receipt_number, total_minor, payment_summary, snapshot, print_status, issued_at, issued_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $8)",
              [
                crypto.randomUUID(),
                businessId,
                input.orderId,
                asNumber(numberRow?.nextNumber),
                asNumber(orderRow.totalMinor),
                JSON.stringify(
                  snapshot.payments.map((payment) => ({
                    method: payment.method,
                    amountMinor: payment.amountMinor,
                  })),
                ),
                JSON.stringify(snapshot),
                now,
                createdBy,
              ],
            );
            receiptCreated = true;
          }
        }
        await execute(db, "COMMIT");
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
      const updated = await getOrder(db, input.orderId);
      if (receiptCreated && updated.receipt) {
        await attemptReceiptPrint(
          db,
          updated.receipt,
          updated,
          await getActiveReceiptPrinter(db),
        );
        return getOrder(db, input.orderId);
      }
      return updated;
    },
    async listReceipts() {
      const db = await database();
      const rows = await select<Row>(
        db,
        "SELECT id, receipt_number AS receiptNumber, total_minor AS totalMinor, issued_at AS issuedAt, print_status AS printStatus, printed_at AS printedAt, last_print_error AS lastPrintError, snapshot FROM receipts WHERE business_id = $1 ORDER BY issued_at DESC",
        [businessId],
      );
      return rows.map((row) => {
        let snapshot: { items?: PosOrder["items"]; payments?: PosPayment[] } =
          {};
        try {
          snapshot = JSON.parse(asString(row.snapshot)) as typeof snapshot;
        } catch {
          /* legacy row */
        }
        return mapReceipt(row, snapshot);
      });
    },
    async retryPendingReceiptPrints() {
      const db = await database();
      const rows = await select<Row>(
        db,
        "SELECT order_id AS orderId FROM receipts WHERE business_id = $1 AND print_status <> 'printed'",
        [businessId],
      );
      const printer = await getActiveReceiptPrinter(db);
      const orders: PosOrder[] = [];
      for (const row of rows) {
        const order = await getOrder(db, asString(row.orderId));
        if (order.receipt)
          await attemptReceiptPrint(db, order.receipt, order, printer);
        orders.push(await getOrder(db, order.id));
      }
      return orders;
    },
    async reprintReceipt(orderId) {
      const db = await database();
      const order = await getOrder(db, orderId);
      if (!order.receipt)
        throw new PosClientError("not_found", "Receipt not found.");
      await attemptReceiptPrint(
        db,
        order.receipt,
        order,
        await getActiveReceiptPrinter(db),
        true,
      );
    },
    async listInventory() {
      return listInventoryRows(await database());
    },
    async getInventoryItem(itemId) {
      const item = (await listInventoryRows(await database())).find(
        (entry) => entry.id === itemId,
      );
      if (!item)
        throw new PosClientError("not_found", "Inventory item not found.");
      return item;
    },
    async listStockMovements(itemId) {
      const db = await database();
      const rows = await select<Row>(
        db,
        "SELECT id, inventory_item_id AS inventoryItemId, type, quantity_delta AS quantityDelta, balance_after AS balanceAfter, reason, created_by AS createdBy, created_at AS createdAt FROM stock_movements WHERE inventory_item_id = $1 AND business_id = $2 ORDER BY created_at DESC, id DESC",
        [itemId, businessId],
      );
      return rows.map(mapStockMovement);
    },
    async createInventoryItem(input) {
      if (!input.name.trim())
        throw new PosClientError(
          "validation",
          "Inventory item name is required.",
        );
      if (
        !Number.isSafeInteger(input.startingQuantity) ||
        input.startingQuantity < 0
      )
        throw new PosClientError(
          "validation",
          "Starting quantity must be a non-negative whole number.",
        );
      const id = crypto.randomUUID();
      const now = timestamp();
      const db = await database();
      await execute(db, "BEGIN IMMEDIATE");
      try {
        await execute(
          db,
          "INSERT INTO inventory_items (id, business_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at) VALUES ($1, $2, $3, $4, 0, $5, 1, $6, $6)",
          [
            id,
            businessId,
            input.name.trim(),
            input.unit,
            input.reorderThreshold,
            now,
          ],
        );
        if (input.startingQuantity > 0) {
          await execute(
            db,
            "INSERT INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES ($1, $2, $3, 'purchase', $4, $4, 'Opening balance', $5, $6)",
            [
              crypto.randomUUID(),
              businessId,
              id,
              input.startingQuantity,
              createdBy,
              now,
            ],
          );
          await execute(
            db,
            "UPDATE inventory_items SET current_quantity = $1, updated_at = $2 WHERE id = $3 AND business_id = $4",
            [input.startingQuantity, now, id, businessId],
          );
        }
        await execute(db, "COMMIT");
      } catch (error) {
        await execute(db, "ROLLBACK");
        throw error;
      }
      return (await listInventoryRows(db)).find((item) => item.id === id)!;
    },
    async updateInventoryItem(input) {
      const db = await database();
      const [item] = await select<Row>(
        db,
        "SELECT id, unit FROM inventory_items WHERE id = $1 AND business_id = $2",
        [input.id, businessId],
      );
      if (!item)
        throw new PosClientError("not_found", "Inventory item not found.");
      const [history] = await select<Row>(
        db,
        "SELECT id FROM stock_movements WHERE inventory_item_id = $1 AND business_id = $2 LIMIT 1",
        [input.id, businessId],
      );
      if (history && asString(item.unit) !== input.unit)
        throw new PosClientError(
          "validation",
          "Unit cannot change after stock movement history exists.",
        );
      await execute(
        db,
        "UPDATE inventory_items SET name = $1, unit = $2, reorder_threshold = $3, active = $4, updated_at = $5 WHERE id = $6 AND business_id = $7",
        [
          input.name.trim(),
          input.unit,
          input.reorderThreshold,
          input.active ? 1 : 0,
          timestamp(),
          input.id,
          businessId,
        ],
      );
      return (await listInventoryRows(db)).find(
        (entry) => entry.id === input.id,
      )!;
    },
    async receiveStock(itemId, quantity, reason) {
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new PosClientError(
          "validation",
          "Quantity must be a positive whole number.",
        );
      return recordInventoryMovementNative(
        await database(),
        itemId,
        "purchase",
        quantity,
        reason ?? null,
      );
    },
    async issueStock(itemId, quantity, reason) {
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new PosClientError(
          "validation",
          "Quantity must be a positive whole number.",
        );
      return recordInventoryMovementNative(
        await database(),
        itemId,
        "kitchen_issue",
        -quantity,
        reason ?? null,
      );
    },
    async recordWaste(itemId, quantity, reason) {
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new PosClientError(
          "validation",
          "Quantity must be a positive whole number.",
        );
      return recordInventoryMovementNative(
        await database(),
        itemId,
        "waste",
        -quantity,
        reason,
      );
    },
    async returnStock(itemId, quantity, reason) {
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new PosClientError(
          "validation",
          "Quantity must be a positive whole number.",
        );
      return recordInventoryMovementNative(
        await database(),
        itemId,
        "return",
        quantity,
        reason ?? null,
      );
    },
    async adjustStockToCount(itemId, countedQuantity, reason) {
      if (!Number.isSafeInteger(countedQuantity) || countedQuantity < 0)
        throw new PosClientError(
          "validation",
          "Counted quantity must be a non-negative whole number.",
        );
      if (!reason.trim())
        throw new PosClientError(
          "validation",
          "A reason is required for this movement.",
        );
      const item = await this.getInventoryItem(itemId);
      const delta = countedQuantity - item.currentQuantity;
      if (delta === 0) return item;
      return recordInventoryMovementNative(
        await database(),
        itemId,
        "adjustment",
        delta,
        reason,
      );
    },
  };
  return serializeClient(client);
}
