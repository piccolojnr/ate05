import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export * from "./schema";
export { createMenuRepository } from "./repositories";
export { developmentSeedIds, seedDevelopmentData } from "./seed";

export function createDatabase(filename = ":memory:") {
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** Applies checked-in Drizzle migrations to a local SQLite database. */
export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
}
