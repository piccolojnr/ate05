import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  developmentSeedIds,
  initializeDatabase,
  seedDevelopmentData,
} from "../index";
import { createPosService } from "./pos-service";

let database: ReturnType<typeof createDatabase>;
let service: ReturnType<typeof createPosService>;
const { business, owner, table1, friedRice, coke } = developmentSeedIds;

beforeEach(() => {
  database = createDatabase();
  initializeDatabase(database.sqlite);
  seedDevelopmentData(database.sqlite);
  service = createPosService(database.sqlite);
});

afterEach(() => database.sqlite.close());

describe("POS application service", () => {
  it("loads only active categories and available active menu items", () => {
    database.sqlite
      .prepare("UPDATE menu_items SET available = 0 WHERE id = ?")
      .run(coke);
    database.sqlite
      .prepare("UPDATE menu_categories SET active = 0 WHERE id = ?")
      .run(developmentSeedIds.sidesCategory);
    const menu = service.getMenu(business);
    expect(menu.categories.map((category) => category.name)).toEqual([
      "Rice",
      "Drinks",
    ]);
    expect(menu.items.map((item) => item.name)).not.toContain("Coke");
    expect(menu.items.map((item) => item.name)).not.toContain("Chicken Wings");
  });

  it("refuses unavailable and archived menu items", () => {
    database.sqlite
      .prepare("UPDATE menu_items SET available = 0 WHERE id = ?")
      .run(coke);
    expect(() =>
      service.addMenuItem({
        businessId: business,
        createdBy: owner,
        menuItemId: coke,
        orderType: "takeaway",
      }),
    ).toThrow("unavailable");
  });

  it("creates a dine-in order with its selected table only when the first item is added", () => {
    expect(service.listOpenOrders(business)).toHaveLength(0);
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "dine_in",
      tableId: table1,
    });
    expect(order).toMatchObject({
      orderType: "dine_in",
      tableId: table1,
      tableName: "Table 1",
      status: "open",
      paymentStatus: "unpaid",
      subtotalMinor: 5000,
      totalMinor: 5000,
    });
  });

  it("creates takeaway orders without a table and rejects invalid table combinations", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    expect(order.tableId).toBeNull();
    expect(() =>
      service.createOrder({
        businessId: business,
        createdBy: owner,
        orderType: "dine_in",
      }),
    ).toThrow("table");
    expect(() =>
      service.createOrder({
        businessId: business,
        createdBy: owner,
        orderType: "takeaway",
        tableId: table1,
      }),
    ).toThrow("cannot");
  });

  it("snapshots the menu name and price at the moment an item is added", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    database.sqlite
      .prepare(
        "UPDATE menu_items SET name = 'New fried rice', selling_price_minor = 9000 WHERE id = ?",
      )
      .run(friedRice);
    expect(service.getOrder(order.id, business).items).toEqual([
      expect.objectContaining({
        name: "Fried Rice",
        unitPriceMinor: 5000,
        lineTotalMinor: 5000,
      }),
    ]);
  });

  it("updates quantities, notes, and integer totals before removing an empty line", () => {
    let order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    const itemId = order.items[0]!.id;
    order = service.updateOrderItemQuantity(business, order.id, itemId, 3);
    expect(order).toMatchObject({ subtotalMinor: 15000, totalMinor: 15000 });
    order = service.updateOrderItemNote(
      business,
      order.id,
      itemId,
      "No pepper",
    );
    expect(order.items[0]?.notes).toBe("No pepper");
    order = service.updateOrderItemQuantity(business, order.id, itemId, 0);
    expect(order).toMatchObject({ subtotalMinor: 0, totalMinor: 0, items: [] });
  });

  it("reloads persisted orders through a new application-service instance", () => {
    const created = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: coke,
      orderType: "takeaway",
    });
    const recreatedService = createPosService(database.sqlite);
    expect(recreatedService.getOrder(created.id, business)).toMatchObject({
      id: created.id,
      totalMinor: 1200,
      items: [expect.objectContaining({ name: "Coke" })],
    });
  });

  it("supports multiple open orders and derives occupied tables from open dine-in orders", () => {
    const dineIn = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "dine_in",
      tableId: table1,
    });
    const takeaway = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: coke,
      orderType: "takeaway",
    });
    expect(service.listOpenOrders(business).map((order) => order.id)).toEqual([
      takeaway.id,
      dineIn.id,
    ]);
    expect(
      service.listAvailableTables(business).find((table) => table.id === table1)
        ?.status,
    ).toBe("occupied");
  });

  it("keeps business-scoped reads isolated", () => {
    database.sqlite
      .prepare(
        "INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000901', 'Other', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      )
      .run();
    expect(
      service.listOpenOrders("00000000-0000-4000-8000-000000000901"),
    ).toEqual([]);
    expect(() =>
      service.getOrder("missing", "00000000-0000-4000-8000-000000000901"),
    ).toThrow("not found");
  });
});
