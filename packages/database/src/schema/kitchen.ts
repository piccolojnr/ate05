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

export const kitchenTickets = sqliteTable(
  "kitchen_tickets",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    printStatus: text("print_status").notNull().default("pending"),
    printedAt: text("printed_at"),
    lastPrintError: text("last_print_error"),
    printAttemptCount: integer("print_attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("kitchen_tickets_business_id_idx").on(table.businessId),
    index("kitchen_tickets_order_id_idx").on(table.orderId),
    uniqueIndex("kitchen_tickets_order_sequence_unique").on(
      table.orderId,
      table.sequence,
    ),
    check("kitchen_tickets_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "kitchen_tickets_type_check",
      sql`${table.type} in ('initial', 'addition', 'cancellation')`,
    ),
    check(
      "kitchen_tickets_print_status_check",
      sql`${table.printStatus} in ('pending', 'printed', 'failed')`,
    ),
  ],
);

export const kitchenTicketItems = sqliteTable(
  "kitchen_ticket_items",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    kitchenTicketId: text("kitchen_ticket_id")
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: "cascade" }),
    orderItemId: text("order_item_id"),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    action: text("action").notNull().default("add"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("kitchen_ticket_items_ticket_id_idx").on(table.kitchenTicketId),
    index("kitchen_ticket_items_business_id_idx").on(table.businessId),
    check("kitchen_ticket_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "kitchen_ticket_items_action_check",
      sql`${table.action} in ('add', 'cancel')`,
    ),
  ],
);
