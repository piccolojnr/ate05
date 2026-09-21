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

  it("rolls back sequence allocation when order creation fails and reuses it on retry", () => {
    database.sqlite.exec(
      "CREATE TRIGGER fail_order_write AFTER INSERT ON orders BEGIN SELECT RAISE(ABORT, 'injected order failure'); END",
    );
    expect(() =>
      service.createOrder({
        businessId: business,
        createdBy: owner,
        orderType: "takeaway",
      }),
    ).toThrow("injected order failure");
    database.sqlite.exec("DROP TRIGGER fail_order_write");
    expect(
      service.createOrder({
        businessId: business,
        createdBy: owner,
        orderType: "takeaway",
      }).orderNumber,
    ).toBe(1);
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

  it("creates and updates menu items without changing historical order snapshots", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    const menu = service.listMenuManagement(business);
    const riceCategory = menu.categories.find(
      (category) => category.name === "Rice",
    )!;
    const created = service.createMenuItem({
      businessId: business,
      name: "Lunch Rice",
      description: "Daily special",
      categoryId: riceCategory.id,
      sellingPriceMinor: 4250,
      available: true,
      active: true,
    });
    expect(created).toMatchObject({
      name: "Lunch Rice",
      sellingPriceMinor: 4250,
      available: true,
    });
    const updated = service.updateMenuItem({
      businessId: business,
      id: friedRice,
      name: "Fried Rice",
      categoryId: riceCategory.id,
      sellingPriceMinor: 5500,
      available: false,
      active: true,
    });
    expect(updated).toMatchObject({
      sellingPriceMinor: 5500,
      available: false,
    });
    expect(service.getOrder(order.id, business).items[0]).toMatchObject({
      name: "Fried Rice",
      unitPriceMinor: 5000,
    });
    expect(
      service.getMenu(business).items.map((item) => item.id),
    ).not.toContain(friedRice);
    const recreated = createPosService(database.sqlite);
    expect(
      recreated
        .listMenuManagement(business)
        .items.find((item) => item.id === created.id),
    ).toMatchObject({ name: "Lunch Rice" });
  });

  it("enforces menu business scoping and validates prices", () => {
    const category = service.listMenuManagement(business).categories[0]!;
    expect(() =>
      service.createMenuItem({
        businessId: "00000000-0000-4000-8000-000000000901",
        name: "Private Item",
        categoryId: category.id,
        sellingPriceMinor: 100,
        available: true,
        active: true,
      }),
    ).toThrow("category");
    expect(() =>
      service.updateMenuItem({
        businessId: business,
        id: friedRice,
        name: "Fried Rice",
        categoryId: category.id,
        sellingPriceMinor: -1,
        available: true,
        active: true,
      }),
    ).toThrow("Price");
  });

  it("validates, persists, updates, retires, and restores named price options", () => {
    const category = service.listMenuManagement(business).categories[0]!;
    expect(() =>
      service.createMenuItem({
        businessId: business,
        name: "Invalid options",
        categoryId: category.id,
        sellingPriceMinor: 0,
        pricingMode: "options",
        priceOptions: [],
        available: true,
        active: true,
      }),
    ).toThrow("at least one");
    expect(() =>
      service.createMenuItem({
        businessId: business,
        name: "Duplicate options",
        categoryId: category.id,
        sellingPriceMinor: 0,
        pricingMode: "options",
        priceOptions: [
          { name: " Large ", priceMinor: 11000 },
          { name: "large", priceMinor: 12000 },
        ],
        available: true,
        active: true,
      }),
    ).toThrow("unique");

    const created = service.createMenuItem({
      businessId: business,
      name: "Tilapia",
      categoryId: category.id,
      sellingPriceMinor: 7500,
      pricingMode: "options",
      priceOptions: [
        { name: "Small", priceMinor: 6000 },
        { name: "Large", priceMinor: 11000 },
      ],
      available: true,
      active: true,
    });
    expect(created).toMatchObject({
      pricingMode: "options",
      sellingPriceMinor: 7500,
      priceOptions: [
        expect.objectContaining({
          name: "Small",
          priceMinor: 6000,
          sortOrder: 0,
        }),
        expect.objectContaining({
          name: "Large",
          priceMinor: 11000,
          sortOrder: 1,
        }),
      ],
    });
    const large = created.priceOptions.find(
      (option) => option.name === "Large",
    )!;
    const updated = service.updateMenuItem({
      businessId: business,
      id: created.id,
      name: created.name,
      categoryId: created.categoryId,
      sellingPriceMinor: created.sellingPriceMinor,
      pricingMode: "options",
      priceOptions: [{ id: large.id, name: "Family", priceMinor: 12500 }],
      available: true,
      active: true,
    });
    expect(updated.priceOptions).toEqual([
      expect.objectContaining({
        id: large.id,
        name: "Family",
        priceMinor: 12500,
      }),
    ]);
    expect(
      database.sqlite
        .prepare(
          "SELECT name, active FROM menu_item_price_options WHERE menu_item_id = ? ORDER BY name",
        )
        .all(created.id),
    ).toEqual([
      { name: "Family", active: 1 },
      { name: "Small", active: 0 },
    ]);

    const fixed = service.updateMenuItem({
      businessId: business,
      id: created.id,
      name: created.name,
      categoryId: created.categoryId,
      sellingPriceMinor: 8000,
      pricingMode: "fixed",
      priceOptions: updated.priceOptions,
      available: true,
      active: true,
    });
    expect(fixed).toMatchObject({
      pricingMode: "fixed",
      sellingPriceMinor: 8000,
    });
    const restored = service.updateMenuItem({
      businessId: business,
      id: created.id,
      name: created.name,
      categoryId: created.categoryId,
      sellingPriceMinor: fixed.sellingPriceMinor,
      pricingMode: "options",
      priceOptions: fixed.priceOptions,
      available: true,
      active: true,
    });
    expect(restored.priceOptions[0]).toMatchObject({
      id: large.id,
      name: "Family",
      priceMinor: 12500,
    });
  });

  it("keeps option lines distinct and snapshots option names and charged prices", () => {
    const category = service.listMenuManagement(business).categories[0]!;
    const tilapia = service.createMenuItem({
      businessId: business,
      name: "Tilapia",
      categoryId: category.id,
      sellingPriceMinor: 0,
      pricingMode: "options",
      priceOptions: [
        { name: "Small", priceMinor: 6000 },
        { name: "Large", priceMinor: 11000 },
      ],
      available: true,
      active: true,
    });
    const small = tilapia.priceOptions[0]!;
    const large = tilapia.priceOptions[1]!;
    expect(() =>
      service.addMenuItem({
        businessId: business,
        createdBy: owner,
        menuItemId: tilapia.id,
        orderType: "takeaway",
      }),
    ).toThrow("Choose a price option");
    let order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: tilapia.id,
      priceOptionId: small.id,
      orderType: "takeaway",
    });
    order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      orderId: order.id,
      menuItemId: tilapia.id,
      priceOptionId: large.id,
      orderType: "takeaway",
    });
    order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      orderId: order.id,
      menuItemId: tilapia.id,
      priceOptionId: large.id,
      orderType: "takeaway",
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        priceOptionId: small.id,
        priceOptionName: "Small",
        unitPriceMinor: 6000,
        quantity: 1,
      }),
      expect.objectContaining({
        priceOptionId: large.id,
        priceOptionName: "Large",
        unitPriceMinor: 11000,
        quantity: 2,
      }),
    ]);
    expect(order.totalMinor).toBe(28000);

    service.updateMenuItem({
      businessId: business,
      id: tilapia.id,
      name: tilapia.name,
      categoryId: tilapia.categoryId,
      sellingPriceMinor: tilapia.sellingPriceMinor,
      pricingMode: "options",
      priceOptions: [
        { id: small.id, name: "Small", priceMinor: 6500 },
        { id: large.id, name: "Family", priceMinor: 12500 },
      ],
      available: true,
      active: true,
    });
    const historical = service.getOrder(order.id, business);
    expect(historical.totalMinor).toBe(28000);
    expect(historical.items[1]).toMatchObject({
      priceOptionName: "Large",
      unitPriceMinor: 11000,
      quantity: 2,
    });
    const newOrder = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: tilapia.id,
      priceOptionId: large.id,
      orderType: "takeaway",
    });
    expect(newOrder.items[0]).toMatchObject({
      priceOptionName: "Family",
      unitPriceMinor: 12500,
    });
    const kitchen = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(kitchen.kitchenTickets[0]!.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemName: "Tilapia — Large" }),
      ]),
    );
  });

  it("does not merge a physically deleted option snapshot into a new fixed line", () => {
    const category = service.listMenuManagement(business).categories[0]!;
    const tilapia = service.createMenuItem({
      businessId: business,
      name: "Tilapia",
      categoryId: category.id,
      sellingPriceMinor: 9000,
      pricingMode: "options",
      priceOptions: [{ name: "Large", priceMinor: 11000 }],
      available: true,
      active: true,
    });
    const large = tilapia.priceOptions[0]!;
    let order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: tilapia.id,
      priceOptionId: large.id,
      orderType: "takeaway",
    });

    database.sqlite
      .prepare("DELETE FROM menu_item_price_options WHERE id = ?")
      .run(large.id);
    service.updateMenuItem({
      businessId: business,
      id: tilapia.id,
      name: tilapia.name,
      categoryId: tilapia.categoryId,
      sellingPriceMinor: 9000,
      pricingMode: "fixed",
      available: true,
      active: true,
    });
    order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      orderId: order.id,
      menuItemId: tilapia.id,
      orderType: "takeaway",
    });

    expect(order.items).toEqual([
      expect.objectContaining({
        priceOptionId: null,
        priceOptionName: "Large",
        unitPriceMinor: 11000,
        quantity: 1,
      }),
      expect.objectContaining({
        priceOptionId: null,
        priceOptionName: null,
        unitPriceMinor: 9000,
        quantity: 1,
      }),
    ]);
    expect(order.totalMinor).toBe(20000);
  });

  it("does not deactivate a category that still owns active items", () => {
    const category = service
      .listMenuManagement(business)
      .categories.find((entry) => entry.name === "Rice")!;
    expect(() =>
      service.updateMenuCategory({
        businessId: business,
        id: category.id,
        name: category.name,
        active: false,
      }),
    ).toThrow("active items");
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

  it("rolls back a kitchen ticket if ticket items fail after the ticket row", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    database.sqlite.exec(
      "CREATE TRIGGER fail_kitchen_item AFTER INSERT ON kitchen_ticket_items BEGIN SELECT RAISE(ABORT, 'injected kitchen item failure'); END",
    );
    expect(() =>
      service.sendOrderToKitchen({
        businessId: business,
        orderId: order.id,
        userId: owner,
      }),
    ).toThrow("injected kitchen item failure");
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM kitchen_tickets WHERE order_id = ?",
        )
        .get(order.id),
    ).toEqual({ count: 0 });
    expect(service.getOrder(order.id, business).status).toBe("open");
  });

  it("creates and manages business-scoped tables with reservation state", () => {
    const patio = service.createTable({
      businessId: business,
      name: "Patio 1",
      capacity: 6,
    });
    expect(patio).toMatchObject({
      name: "Patio 1",
      capacity: 6,
      active: true,
      status: "available",
    });
    expect(() =>
      service.createTable({ businessId: business, name: "patio 1" }),
    ).toThrow("already exists");
    const renamed = service.updateTable({
      businessId: business,
      id: patio.id,
      name: "Patio Main",
      capacity: 6,
      active: true,
    });
    expect(renamed.name).toBe("Patio Main");
    expect(
      service.setTableReservationState(business, patio.id, true).status,
    ).toBe("reserved");
    expect(
      service.setTableReservationState(business, patio.id, false).status,
    ).toBe("available");
    expect(() =>
      service.updateTable({
        businessId: "00000000-0000-4000-8000-000000000901",
        id: patio.id,
        name: "Other business table",
        active: true,
      }),
    ).toThrow("not found");
  });

  it("guards table occupancy and releases it only on explicit completion", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "dine_in",
      tableId: table1,
    });
    expect(
      service
        .listAvailableTables(business)
        .find((table) => table.id === table1),
    ).toMatchObject({ status: "occupied" });
    database.sqlite
      .prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?")
      .run(order.id);
    expect(
      service
        .listAvailableTables(business)
        .find((table) => table.id === table1),
    ).toMatchObject({ status: "occupied" });
    expect(() =>
      service.addMenuItem({
        businessId: business,
        createdBy: owner,
        menuItemId: coke,
        orderType: "dine_in",
        tableId: table1,
      }),
    ).toThrow("already has an active order");
    expect(() =>
      service.updateTable({
        businessId: business,
        id: table1,
        name: "Table 1",
        active: false,
      }),
    ).toThrow("Complete the active order");
    const completed = service.completeOrder(order.id, business);
    expect(completed.status).toBe("completed");
    expect(completed.tableId).toBe(table1);
    expect(
      service
        .listAvailableTables(business)
        .find((table) => table.id === table1),
    ).toMatchObject({ status: "available" });
  });

  it("rolls back order completion when table release fails", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "dine_in",
      tableId: table1,
    });
    database.sqlite.exec(
      "CREATE TRIGGER fail_table_release AFTER UPDATE OF status ON restaurant_tables BEGIN SELECT RAISE(ABORT, 'injected table release failure'); END",
    );
    expect(() => service.completeOrder(order.id, business)).toThrow(
      "injected table release failure",
    );
    expect(service.getOrder(order.id, business).status).toBe("open");
    expect(
      service
        .listAvailableTables(business)
        .find((table) => table.id === table1),
    ).toMatchObject({ status: "occupied" });
  });

  it("does not allow deactivated tables to start new orders", () => {
    const table = service.createTable({ businessId: business, name: "Back 1" });
    service.updateTable({
      businessId: business,
      id: table.id,
      name: table.name,
      active: false,
    });
    expect(() =>
      service.addMenuItem({
        businessId: business,
        createdBy: owner,
        menuItemId: friedRice,
        orderType: "dine_in",
        tableId: table.id,
      }),
    ).toThrow("unavailable");
    expect(
      service
        .listAvailableTables(business)
        .find((entry) => entry.id === table.id),
    ).toMatchObject({ active: false });
    expect(
      service.updateTable({
        businessId: business,
        id: table.id,
        name: table.name,
        active: true,
      }).active,
    ).toBe(true);
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

  it("creates one initial pending ticket and moves the order to the kitchen", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: coke,
      orderType: "takeaway",
      orderId: order.id,
    });
    const sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(sent).toMatchObject({
      status: "sent_to_kitchen",
      paymentStatus: "unpaid",
      kitchenChangesPending: false,
    });
    expect(sent.kitchenTickets).toHaveLength(1);
    expect(sent.kitchenTickets[0]).toMatchObject({
      sequence: 1,
      type: "initial",
      printStatus: "pending",
    });
    expect(sent.kitchenTickets[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemName: "Fried Rice",
          quantity: 1,
          action: "add",
        }),
        expect.objectContaining({
          itemName: "Coke",
          quantity: 1,
          action: "add",
        }),
      ]),
    );
  });

  it("does not duplicate a ticket when Send to Kitchen has no changes", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    const again = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(again.kitchenTickets).toHaveLength(1);
  });

  it("creates addition deltas for new and increased quantities", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    let updated = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
      orderId: order.id,
    });
    updated = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: coke,
      orderType: "takeaway",
      orderId: order.id,
    });
    const sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(updated.kitchenChangesPending).toBe(true);
    expect(sent.kitchenTickets).toHaveLength(2);
    expect(sent.kitchenTickets[1]).toMatchObject({
      type: "addition",
      sequence: 2,
    });
    expect(sent.kitchenTickets[1]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemName: "Fried Rice",
          quantity: 1,
          action: "add",
        }),
        expect.objectContaining({
          itemName: "Coke",
          quantity: 1,
          action: "add",
        }),
      ]),
    );
  });

  it("creates cancellation deltas for reductions and fully removed sent items", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    const item = order.items[0]!;
    service.updateOrderItemQuantity(business, order.id, item.id, 3);
    service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    let updated = service.updateOrderItemQuantity(
      business,
      order.id,
      item.id,
      2,
    );
    expect(updated.kitchenChangesPending).toBe(true);
    let sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(sent.kitchenTickets[1]?.items).toEqual([
      expect.objectContaining({
        itemName: "Fried Rice",
        quantity: 1,
        action: "cancel",
      }),
    ]);
    updated = service.updateOrderItemQuantity(business, order.id, item.id, 0);
    sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(updated.items).toHaveLength(0);
    expect(sent.kitchenTickets[2]?.items).toEqual([
      expect.objectContaining({
        itemName: "Fried Rice",
        quantity: 2,
        action: "cancel",
      }),
    ]);
  });

  it("does not create a cancellation for an item removed before its first send", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    service.updateOrderItemQuantity(business, order.id, order.items[0]!.id, 0);
    const sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(sent.kitchenTickets).toHaveLength(0);
    expect(sent.status).toBe("open");
  });

  it("uses cancellation plus addition for a material note change", () => {
    let order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    const itemId = order.items[0]!.id;
    order = service.updateOrderItemNote(
      business,
      order.id,
      itemId,
      "No pepper",
    );
    service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    order = service.updateOrderItemNote(
      business,
      order.id,
      itemId,
      "Extra pepper",
    );
    const sent = service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    expect(sent.kitchenTickets.slice(1).map((ticket) => ticket.type)).toEqual([
      "cancellation",
      "addition",
    ]);
    expect(sent.kitchenTickets[1]?.items[0]).toMatchObject({
      quantity: 1,
      action: "cancel",
      notes: "No pepper",
    });
    expect(sent.kitchenTickets[2]?.items[0]).toMatchObject({
      quantity: 1,
      action: "add",
      notes: "Extra pepper",
    });
  });

  it("keeps ticket snapshots, sequence, print status, and history after service recreation", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    service.updateOrderItemNote(
      business,
      order.id,
      order.items[0]!.id,
      "No pepper",
    );
    service.sendOrderToKitchen({
      businessId: business,
      orderId: order.id,
      userId: owner,
    });
    database.sqlite
      .prepare(
        "UPDATE order_items SET item_name_snapshot = 'Renamed Rice', notes = 'Changed later' WHERE id = ?",
      )
      .run(order.items[0]!.id);
    const reloaded = createPosService(database.sqlite).getOrder(
      order.id,
      business,
    );
    expect(reloaded.kitchenTickets[0]).toMatchObject({
      sequence: 1,
      printStatus: "pending",
    });
    expect(reloaded.kitchenTickets[0]?.items[0]).toMatchObject({
      itemName: "Fried Rice",
      notes: "No pepper",
      quantity: 1,
    });
  });

  it("rolls back the send operation when validation fails", () => {
    const order = service.addMenuItem({
      businessId: business,
      createdBy: owner,
      menuItemId: friedRice,
      orderType: "takeaway",
    });
    expect(() =>
      service.sendOrderToKitchen({
        businessId: business,
        orderId: order.id,
        userId: "missing-user",
      }),
    ).toThrow("sending user");
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM kitchen_tickets")
        .get(),
    ).toEqual({ count: 0 });
    expect(service.getOrder(order.id, business)).toMatchObject({
      status: "open",
      paymentStatus: "unpaid",
    });
  });

  it("keeps an auditable inventory ledger through receive, issue, waste, return, and count adjustment", () => {
    const item = service.createInventoryItem({
      businessId: business,
      createdBy: owner,
      name: "Test Chicken",
      unit: "g",
      startingQuantity: 10000,
      reorderThreshold: 3000,
    });
    expect(item.currentQuantity).toBe(10000);
    expect(service.listStockMovements(item.id, business)).toHaveLength(1);
    service.receiveStock(business, owner, item.id, 5000, "Purchase");
    service.issueStock(business, owner, item.id, 2000, "Prep");
    service.recordWaste(business, owner, item.id, 1000, "Spoiled");
    service.returnStock(business, owner, item.id, 500, "Unused");
    const adjusted = service.adjustStockToCount(
      business,
      owner,
      item.id,
      11000,
      "Physical count",
    );
    expect(adjusted.currentQuantity).toBe(11000);
    expect(service.listStockMovements(item.id, business)).toHaveLength(6);
    expect(
      database.sqlite
        .prepare(
          "SELECT SUM(quantity_delta) AS balance FROM stock_movements WHERE inventory_item_id = ?",
        )
        .get(item.id),
    ).toEqual({ balance: 11000 });
  });

  it("rejects insufficient stock, missing reasons, unsafe unit changes, and preserves history", () => {
    const item = service.createInventoryItem({
      businessId: business,
      createdBy: owner,
      name: "Test Oil",
      unit: "ml",
      startingQuantity: 1000,
      reorderThreshold: 200,
    });
    expect(() => service.issueStock(business, owner, item.id, 1001)).toThrow(
      "Only 1000 ml",
    );
    expect(() => service.recordWaste(business, owner, item.id, 1, "")).toThrow(
      "reason",
    );
    expect(() =>
      service.updateInventoryItem({
        businessId: business,
        id: item.id,
        name: "Test Oil",
        unit: "litre",
        reorderThreshold: 200,
        active: true,
      }),
    ).toThrow("Unit cannot change");
    const before = service.listStockMovements(item.id, business);
    service.updateInventoryItem({
      businessId: business,
      id: item.id,
      name: "Archived Oil",
      unit: "ml",
      reorderThreshold: 200,
      active: false,
    });
    expect(service.listStockMovements(item.id, business)).toEqual(before);
  });

  it("rolls back an inventory movement if the balance update cannot complete", () => {
    const item = service.createInventoryItem({
      businessId: business,
      createdBy: owner,
      name: "Rollback Oil",
      unit: "ml",
      startingQuantity: 1000,
      reorderThreshold: 200,
    });
    database.sqlite.exec(
      "CREATE TRIGGER fail_stock_balance AFTER INSERT ON stock_movements BEGIN SELECT RAISE(ABORT, 'injected stock failure'); END",
    );
    expect(() =>
      service.receiveStock(business, owner, item.id, 500, "Purchase"),
    ).toThrow("injected stock failure");
    expect(
      service.listInventory(business).find((entry) => entry.id === item.id)
        ?.currentQuantity,
    ).toBe(1000);
    expect(service.listStockMovements(item.id, business)).toHaveLength(1);
  });
});
