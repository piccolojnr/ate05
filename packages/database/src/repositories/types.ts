import type { createDatabase } from "../index";

export type DatabaseClient = ReturnType<typeof createDatabase>["db"];
