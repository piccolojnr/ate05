import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { businesses } from "./businesses";
import { printers } from "./printers";

/** Append-only operational history for physical and preview print attempts. */
export const printAttempts = sqliteTable(
  "print_attempts",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    documentType: text("document_type").notNull(),
    documentId: text("document_id").notNull(),
    printerId: text("printer_id").references(() => printers.id, {
      onDelete: "set null",
    }),
    context: text("context").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    failureCategory: text("failure_category"),
    failureMessage: text("failure_message"),
  },
  (table) => [
    index("print_attempts_business_attempted_idx").on(
      table.businessId,
      table.attemptedAt,
    ),
    index("print_attempts_document_idx").on(
      table.documentType,
      table.documentId,
    ),
    check(
      "print_attempts_document_type_check",
      sql`${table.documentType} in ('kitchen_ticket', 'receipt', 'test')`,
    ),
    check(
      "print_attempts_context_check",
      sql`${table.context} in ('initial', 'retry', 'reprint', 'test')`,
    ),
  ],
);
