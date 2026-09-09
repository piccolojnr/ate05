import type Database from "better-sqlite3";

/** Stable IDs make local development fixtures easy to reference in tests and demos. */
export const developmentSeedIds = {
  business: "00000000-0000-4000-8000-000000000001",
  owner: "00000000-0000-4000-8000-000000000002",
  riceCategory: "00000000-0000-4000-8000-000000000010",
  drinksCategory: "00000000-0000-4000-8000-000000000011",
  sidesCategory: "00000000-0000-4000-8000-000000000012",
  friedRice: "00000000-0000-4000-8000-000000000020",
  jollofRice: "00000000-0000-4000-8000-000000000021",
  chickenWings: "00000000-0000-4000-8000-000000000022",
  coke: "00000000-0000-4000-8000-000000000023",
  table1: "00000000-0000-4000-8000-000000000030",
  table2: "00000000-0000-4000-8000-000000000031",
  table3: "00000000-0000-4000-8000-000000000032",
  table4: "00000000-0000-4000-8000-000000000033",
  chicken: "00000000-0000-4000-8000-000000000040",
  rice: "00000000-0000-4000-8000-000000000041",
  cookingOil: "00000000-0000-4000-8000-000000000042",
  cokeStock: "00000000-0000-4000-8000-000000000043",
  takeawayPacks: "00000000-0000-4000-8000-000000000044",
} as const;

const seededAt = "2026-01-01T00:00:00.000Z";

/** Development-only fixture data. Production initialization never calls this function. */
export function seedDevelopmentData(sqlite: Database.Database): void {
  const ids = developmentSeedIds;
  sqlite.transaction(() => {
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO businesses (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run(ids.business, "ATE05", seededAt, seededAt);
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO users (id, business_id, name, role, active, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, ?, ?)",
      )
      .run(ids.owner, ids.business, "ATE05 Owner", seededAt, seededAt);

    const insertCategory = sqlite.prepare(
      "INSERT OR IGNORE INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    );
    insertCategory.run(
      ids.riceCategory,
      ids.business,
      "Rice",
      1,
      seededAt,
      seededAt,
    );
    insertCategory.run(
      ids.drinksCategory,
      ids.business,
      "Drinks",
      2,
      seededAt,
      seededAt,
    );
    insertCategory.run(
      ids.sidesCategory,
      ids.business,
      "Sides",
      3,
      seededAt,
      seededAt,
    );

    const insertMenuItem = sqlite.prepare(
      "INSERT OR IGNORE INTO menu_items (id, business_id, category_id, name, selling_price_minor, available, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)",
    );
    insertMenuItem.run(
      ids.friedRice,
      ids.business,
      ids.riceCategory,
      "Fried Rice",
      5000,
      seededAt,
      seededAt,
    );
    insertMenuItem.run(
      ids.jollofRice,
      ids.business,
      ids.riceCategory,
      "Jollof Rice",
      4500,
      seededAt,
      seededAt,
    );
    insertMenuItem.run(
      ids.chickenWings,
      ids.business,
      ids.sidesCategory,
      "Chicken Wings",
      3500,
      seededAt,
      seededAt,
    );
    insertMenuItem.run(
      ids.coke,
      ids.business,
      ids.drinksCategory,
      "Coke",
      1200,
      seededAt,
      seededAt,
    );

    const insertTable = sqlite.prepare(
      "INSERT OR IGNORE INTO restaurant_tables (id, business_id, name, capacity, status, active, created_at, updated_at) VALUES (?, ?, ?, 4, 'available', 1, ?, ?)",
    );
    for (const [id, name] of [
      [ids.table1, "Table 1"],
      [ids.table2, "Table 2"],
      [ids.table3, "Table 3"],
      [ids.table4, "Table 4"],
    ])
      insertTable.run(id, ids.business, name, seededAt, seededAt);

    const insertInventory = sqlite.prepare(
      "INSERT OR IGNORE INTO inventory_items (id, business_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    );
    insertInventory.run(
      ids.chicken,
      ids.business,
      "Chicken",
      "g",
      30000,
      5000,
      seededAt,
      seededAt,
    );
    insertInventory.run(
      ids.rice,
      ids.business,
      "Rice",
      "g",
      50000,
      10000,
      seededAt,
      seededAt,
    );
    insertInventory.run(
      ids.cookingOil,
      ids.business,
      "Cooking Oil",
      "ml",
      10000,
      2000,
      seededAt,
      seededAt,
    );
    insertInventory.run(
      ids.cokeStock,
      ids.business,
      "Coke",
      "bottle",
      48,
      12,
      seededAt,
      seededAt,
    );
    insertInventory.run(
      ids.takeawayPacks,
      ids.business,
      "Takeaway Packs",
      "pack",
      100,
      20,
      seededAt,
      seededAt,
    );
    const insertOpeningMovement = sqlite.prepare(
      "INSERT OR IGNORE INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES (?, ?, ?, 'purchase', ?, ?, 'Opening balance', ?, ?)",
    );
    for (const [itemId, quantity, movementId] of [
      [ids.chicken, 30000, "00000000-0000-4000-8000-000000000050"],
      [ids.rice, 50000, "00000000-0000-4000-8000-000000000051"],
      [ids.cookingOil, 10000, "00000000-0000-4000-8000-000000000052"],
      [ids.cokeStock, 48, "00000000-0000-4000-8000-000000000053"],
      [ids.takeawayPacks, 100, "00000000-0000-4000-8000-000000000054"],
    ] as const)
      insertOpeningMovement.run(
        movementId,
        ids.business,
        itemId,
        quantity,
        quantity,
        ids.owner,
        seededAt,
      );
  })();
}
