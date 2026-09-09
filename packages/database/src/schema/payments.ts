import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { businesses } from "./businesses";
import { orders } from "./orders";
import { users } from "./users";

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("recorded"),
    reference: text("reference"),
    cashTenderedMinor: integer("cash_tendered_minor"),
    changeMinor: integer("change_minor"),
    idempotencyKey: text("idempotency_key"),
    receivedBy: text("received_by").references(() => users.id, {
      onDelete: "set null",
    }),
    receivedAt: text("received_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("payments_business_id_idx").on(table.businessId),
    index("payments_order_received_at_idx").on(table.orderId, table.receivedAt),
    uniqueIndex("payments_business_id_idempotency_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
    check("payments_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "payments_method_check",
      sql`${table.method} in ('cash', 'mobile_money', 'card', 'other')`,
    ),
    check(
      "payments_status_check",
      sql`${table.status} in ('recorded', 'refunded', 'voided')`,
    ),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    receiptNumber: integer("receipt_number").notNull(),
    totalMinor: integer("total_minor").notNull(),
    paymentSummary: text("payment_summary").notNull(),
    snapshot: text("snapshot").notNull(),
    printStatus: text("print_status").notNull().default("pending"),
    printedAt: text("printed_at"),
    lastPrintError: text("last_print_error"),
    printAttemptCount: integer("print_attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    issuedAt: text("issued_at").notNull(),
    issuedBy: text("issued_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("receipts_business_id_idx").on(table.businessId),
    uniqueIndex("receipts_business_number_unique").on(
      table.businessId,
      table.receiptNumber,
    ),
    check("receipts_number_positive", sql`${table.receiptNumber} > 0`),
    check("receipts_total_nonnegative", sql`${table.totalMinor} >= 0`),
    check(
      "receipts_print_status_check",
      sql`${table.printStatus} in ('pending', 'printed', 'failed')`,
    ),
  ],
);
