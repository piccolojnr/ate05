import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The ownership boundary for all restaurant operational data. */
export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
