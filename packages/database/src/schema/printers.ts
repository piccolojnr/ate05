import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { businesses } from "./businesses";

export const printers = sqliteTable(
  "printers",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    connectionType: text("connection_type").notNull(),
    address: text("address").notNull(),
    port: integer("port"),
    paperWidth: integer("paper_width").notNull().default(80),
    cutterEnabled: integer("cutter_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("printers_business_role_idx").on(table.businessId, table.role),
    check("printers_role_check", sql`${table.role} in ('kitchen', 'receipt')`),
    check(
      "printers_connection_type_check",
      sql`${table.connectionType} in ('network', 'usb')`,
    ),
    check("printers_paper_width_check", sql`${table.paperWidth} in (58, 80)`),
    check(
      "printers_port_check",
      sql`${table.port} is null or (${table.port} > 0 and ${table.port} < 65536)`,
    ),
  ],
);
