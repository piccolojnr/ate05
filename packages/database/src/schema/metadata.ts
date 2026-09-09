import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Internal local metadata; it intentionally has no business ownership. */
export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
