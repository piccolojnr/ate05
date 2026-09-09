import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export { appMetadata } from "./schema";

export function createDatabase(filename = ":memory:") {
  const sqlite = new Database(filename);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}
