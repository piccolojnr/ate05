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
import { menuItems } from "./menu";
import { restaurantTables } from "./seating";
import { users } from "./users";

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    orderNumber: integer("order_number").notNull(),
    orderType: text("order_type").notNull(),
    tableId: text("table_id").references(() => restaurantTables.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("open"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    notes: text("notes"),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("orders_business_status_idx").on(table.businessId, table.status),
    index("orders_business_table_idx").on(table.businessId, table.tableId),
    uniqueIndex("orders_business_number_unique").on(
      table.businessId,
      table.orderNumber,
    ),
    check("orders_number_positive", sql`${table.orderNumber} > 0`),
    check(
      "orders_type_check",
      sql`${table.orderType} in ('dine_in', 'takeaway')`,
    ),
    check(
      "orders_status_check",
      sql`${table.status} in ('open', 'sent_to_kitchen', 'preparing', 'ready', 'completed', 'cancelled')`,
    ),
    check(
      "orders_payment_status_check",
      sql`${table.paymentStatus} in ('unpaid', 'partially_paid', 'paid', 'refunded')`,
    ),
    check(
      "orders_totals_nonnegative",
      sql`${table.subtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.totalMinor} >= 0`,
    ),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    unitPriceMinorSnapshot: integer("unit_price_minor_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalMinor: integer("line_total_minor").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_business_id_idx").on(table.businessId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "order_items_money_nonnegative",
      sql`${table.unitPriceMinorSnapshot} >= 0 and ${table.lineTotalMinor} >= 0`,
    ),
  ],
);
