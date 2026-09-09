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

export const menuCategories = sqliteTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("menu_categories_business_id_idx").on(table.businessId),
    uniqueIndex("menu_categories_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  ],
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    sellingPriceMinor: integer("selling_price_minor").notNull(),
    available: integer("available", { mode: "boolean" })
      .notNull()
      .default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("menu_items_business_id_idx").on(table.businessId),
    index("menu_items_category_id_idx").on(table.categoryId),
    uniqueIndex("menu_items_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    check("menu_items_price_nonnegative", sql`${table.sellingPriceMinor} >= 0`),
  ],
);
