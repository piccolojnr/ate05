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

/** Local staff accounts are for attribution and future permissions, not cloud auth. */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    pinHash: text("pin_hash"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("users_business_id_idx").on(table.businessId),
    uniqueIndex("users_business_name_unique").on(table.businessId, table.name),
    check(
      "users_role_check",
      sql`${table.role} in ('owner', 'manager', 'cashier', 'waiter', 'kitchen', 'inventory')`,
    ),
  ],
);
