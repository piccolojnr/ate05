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

/** A simple operational table status; floor-plan modelling is intentionally deferred. */
export const restaurantTables = sqliteTable(
  "restaurant_tables",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(1),
    status: text("status").notNull().default("available"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("restaurant_tables_business_id_idx").on(table.businessId),
    uniqueIndex("restaurant_tables_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    check("restaurant_tables_capacity_positive", sql`${table.capacity} > 0`),
    check(
      "restaurant_tables_status_check",
      sql`${table.status} in ('available', 'occupied', 'reserved')`,
    ),
  ],
);
