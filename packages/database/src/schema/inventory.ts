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
import { users } from "./users";

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    currentQuantity: integer("current_quantity").notNull().default(0),
    reorderThreshold: integer("reorder_threshold"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("inventory_items_business_id_idx").on(table.businessId),
    uniqueIndex("inventory_items_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    check(
      "inventory_items_quantity_nonnegative",
      sql`${table.currentQuantity} >= 0`,
    ),
    check(
      "inventory_items_threshold_nonnegative",
      sql`${table.reorderThreshold} is null or ${table.reorderThreshold} >= 0`,
    ),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("stock_movements_item_created_at_idx").on(
      table.inventoryItemId,
      table.createdAt,
    ),
    index("stock_movements_business_created_at_idx").on(
      table.businessId,
      table.createdAt,
    ),
    check("stock_movements_delta_nonzero", sql`${table.quantityDelta} <> 0`),
    check(
      "stock_movements_balance_nonnegative",
      sql`${table.balanceAfter} >= 0`,
    ),
    check(
      "stock_movements_type_check",
      sql`${table.type} in ('purchase', 'kitchen_issue', 'waste', 'adjustment', 'return')`,
    ),
  ],
);
