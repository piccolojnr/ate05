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
    pricingMode: text("pricing_mode").notNull().default("fixed"),
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
    check(
      "menu_items_pricing_mode_check",
      sql`${table.pricingMode} in ('fixed', 'options')`,
    ),
  ],
);

export const menuItemPriceOptions = sqliteTable(
  "menu_item_price_options",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("menu_item_price_options_business_id_idx").on(table.businessId),
    index("menu_item_price_options_menu_item_id_idx").on(table.menuItemId),
    uniqueIndex("menu_item_price_options_item_name_unique")
      .on(table.menuItemId, table.name)
      .where(sql`${table.active} = 1`),
    check(
      "menu_item_price_options_name_nonempty",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "menu_item_price_options_price_nonnegative",
      sql`${table.priceMinor} >= 0`,
    ),
    check(
      "menu_item_price_options_sort_nonnegative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);
