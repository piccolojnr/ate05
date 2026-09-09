import { text, sqliteTable } from "drizzle-orm/sqlite-core";

/** A minimal table confirming the local database wiring. Restaurant tables follow later. */
export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
