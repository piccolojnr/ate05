import { and, asc, eq } from "drizzle-orm";
import { menuCategories, menuItems } from "../schema";
import type { DatabaseClient } from "./types";

/** A small business-scoped boundary for future app data access. */
export function createMenuRepository(db: DatabaseClient) {
  return {
    listAvailable(businessId: string) {
      return db
        .select()
        .from(menuItems)
        .where(
          and(
            eq(menuItems.businessId, businessId),
            eq(menuItems.active, true),
            eq(menuItems.available, true),
          ),
        )
        .orderBy(asc(menuItems.name))
        .all();
    },
    listCategories(businessId: string) {
      return db
        .select()
        .from(menuCategories)
        .where(
          and(
            eq(menuCategories.businessId, businessId),
            eq(menuCategories.active, true),
          ),
        )
        .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name))
        .all();
    },
  };
}
