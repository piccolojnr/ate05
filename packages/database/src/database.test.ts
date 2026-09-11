import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  createMenuRepository,
  developmentSeedIds,
  initializeDatabase,
  seedDevelopmentData,
} from "./index";

const timestamp = "2026-01-02T12:00:00.000Z";
let database: ReturnType<typeof createDatabase>;

beforeEach(() => {
  database = createDatabase();
  initializeDatabase(database.sqlite);
  seedDevelopmentData(database.sqlite);
});

afterEach(() => database.sqlite.close());

function insertOrder(id = "00000000-0000-4000-8000-000000000100") {
  const { business, owner, table1 } = developmentSeedIds;
  database.sqlite
    .prepare(
      "INSERT INTO orders (id, business_id, order_number, order_type, table_id, created_by, status, payment_status, subtotal_minor, discount_minor, total_minor, opened_at, created_at, updated_at) VALUES (?, ?, 142, 'dine_in', ?, ?, 'open', 'unpaid', 10000, 0, 10000, ?, ?, ?)",
    )
    .run(id, business, table1, owner, timestamp, timestamp, timestamp);
  return id;
}

describe("ATE05 SQLite database", () => {
  it("migrates a fresh database and seeds development fixtures", () => {
    const tables = database.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toContain("stock_movements");
    expect(tables.map((table) => table.name)).toContain("printers");
    expect(
      database.sqlite.prepare("SELECT name FROM businesses").get(),
    ).toEqual({ name: "ATE05" });
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM restaurant_tables")
        .get(),
    ).toEqual({ count: 4 });
  });

  it("stores menu money in integer GHS minor units", () => {
    expect(
      database.sqlite
        .prepare("SELECT selling_price_minor FROM menu_items WHERE id = ?")
        .get(developmentSeedIds.friedRice),
    ).toEqual({ selling_price_minor: 5000 });
  });

  it("creates orders with snapshots while keeping order and payment statuses independent", () => {
    const orderId = insertOrder();
    database.sqlite
      .prepare(
        "INSERT INTO order_items (id, business_id, order_id, menu_item_id, item_name_snapshot, unit_price_minor_snapshot, quantity, line_total_minor, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'Fried Rice', 5000, 2, 10000, 'No pepper', ?, ?)",
      )
      .run(
        "00000000-0000-4000-8000-000000000101",
        developmentSeedIds.business,
        orderId,
        developmentSeedIds.friedRice,
        timestamp,
        timestamp,
      );
    database.sqlite
      .prepare(
        "UPDATE orders SET status = 'preparing', payment_status = 'partially_paid' WHERE id = ?",
      )
      .run(orderId);
    expect(
      database.sqlite
        .prepare("SELECT status, payment_status FROM orders WHERE id = ?")
        .get(orderId),
    ).toEqual({ status: "preparing", payment_status: "partially_paid" });
  });

  it("keeps multiple immutable kitchen ticket snapshots for one order", () => {
    const orderId = insertOrder();
    const insertTicket = database.sqlite.prepare(
      "INSERT INTO kitchen_tickets (id, business_id, order_id, sequence, type, created_by, print_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    );
    insertTicket.run(
      "00000000-0000-4000-8000-000000000110",
      developmentSeedIds.business,
      orderId,
      1,
      "initial",
      developmentSeedIds.owner,
      timestamp,
      timestamp,
    );
    insertTicket.run(
      "00000000-0000-4000-8000-000000000111",
      developmentSeedIds.business,
      orderId,
      2,
      "addition",
      developmentSeedIds.owner,
      timestamp,
      timestamp,
    );
    database.sqlite
      .prepare(
        "INSERT INTO kitchen_ticket_items (id, business_id, kitchen_ticket_id, item_name_snapshot, quantity, action, created_at) VALUES (?, ?, ?, 'Chicken Wings', 1, 'add', ?)",
      )
      .run(
        "00000000-0000-4000-8000-000000000112",
        developmentSeedIds.business,
        "00000000-0000-4000-8000-000000000111",
        timestamp,
      );
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM kitchen_tickets WHERE order_id = ?",
        )
        .get(orderId),
    ).toEqual({ count: 2 });
  });

  it("stores business-scoped kitchen printer configuration separately from tickets", () => {
    database.sqlite
      .prepare(
        "INSERT INTO printers (id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at) VALUES (?, ?, 'Kitchen LAN', 'kitchen', 'network', '192.168.1.50', 9100, 80, 1, 1, ?, ?)",
      )
      .run(
        "00000000-0000-4000-8000-000000000115",
        developmentSeedIds.business,
        timestamp,
        timestamp,
      );
    expect(
      database.sqlite
        .prepare(
          "SELECT name, connection_type, port, paper_width, active FROM printers WHERE business_id = ?",
        )
        .get(developmentSeedIds.business),
    ).toEqual({
      name: "Kitchen LAN",
      connection_type: "network",
      port: 9100,
      paper_width: 80,
      active: 1,
    });
  });

  it("stores durable print-attempt history without weakening business scoping", () => {
    database.sqlite
      .prepare(
        "INSERT INTO print_attempts (id, business_id, document_type, document_id, printer_id, context, attempted_at, success, failure_category, failure_message) VALUES (?, ?, 'kitchen_ticket', ?, NULL, 'retry', ?, 0, 'timeout', 'Printer connection timed out.')",
      )
      .run(
        "00000000-0000-4000-8000-000000000116",
        developmentSeedIds.business,
        "00000000-0000-4000-8000-000000000117",
        timestamp,
      );
    expect(
      database.sqlite
        .prepare(
          "SELECT document_type, context, success, failure_category FROM print_attempts WHERE business_id = ?",
        )
        .get(developmentSeedIds.business),
    ).toEqual({
      document_type: "kitchen_ticket",
      context: "retry",
      success: 0,
      failure_category: "timeout",
    });
    expect(() =>
      database.sqlite
        .prepare(
          "INSERT INTO print_attempts (id, business_id, document_type, document_id, context, attempted_at, success) VALUES (?, 'missing-business', 'receipt', 'missing', 'initial', ?, 1)",
        )
        .run("00000000-0000-4000-8000-000000000118", timestamp),
    ).toThrow();
  });

  it("associates independent payment records with an order", () => {
    const orderId = insertOrder();
    database.sqlite
      .prepare(
        "INSERT INTO payments (id, business_id, order_id, amount_minor, method, status, received_by, received_at, created_at, updated_at) VALUES (?, ?, ?, 4000, 'cash', 'recorded', ?, ?, ?, ?)",
      )
      .run(
        "00000000-0000-4000-8000-000000000120",
        developmentSeedIds.business,
        orderId,
        developmentSeedIds.owner,
        timestamp,
        timestamp,
        timestamp,
      );
    expect(
      database.sqlite
        .prepare("SELECT amount_minor, method FROM payments WHERE order_id = ?")
        .get(orderId),
    ).toEqual({ amount_minor: 4000, method: "cash" });
  });

  it.each([
    ["sent_to_kitchen", "1"],
    ["preparing", "2"],
    ["ready", "3"],
  ] as const)(
    "keeps operational status %s when payment becomes fully paid",
    (status, suffix) => {
      const orderId = insertOrder(
        "00000000-0000-4000-8000-00000000012" + suffix,
      );
      database.sqlite
        .prepare("UPDATE orders SET status = ? WHERE id = ?")
        .run(status, orderId);
      database.sqlite
        .prepare(
          "INSERT INTO payments (id, business_id, order_id, amount_minor, method, status, idempotency_key, received_by, received_at, created_at, updated_at) VALUES (?, ?, ?, 10000, 'cash', 'recorded', ?, ?, ?, ?, ?)",
        )
        .run(
          "00000000-0000-4000-8000-00000000013" + suffix,
          developmentSeedIds.business,
          orderId,
          "lifecycle-" + status,
          developmentSeedIds.owner,
          timestamp,
          timestamp,
          timestamp,
        );
      database.sqlite
        .prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?")
        .run(orderId);
      expect(
        database.sqlite
          .prepare("SELECT status, payment_status FROM orders WHERE id = ?")
          .get(orderId),
      ).toEqual({ status, payment_status: "paid" });
      database.sqlite
        .prepare("UPDATE orders SET status = 'completed' WHERE id = ?")
        .run(orderId);
      expect(
        database.sqlite
          .prepare("SELECT status, payment_status FROM orders WHERE id = ?")
          .get(orderId),
      ).toEqual({ status: "completed", payment_status: "paid" });
    },
  );

  it("keeps stock movements as inventory audit history alongside a maintained balance", () => {
    database.sqlite.transaction(() => {
      database.sqlite
        .prepare(
          "UPDATE inventory_items SET current_quantity = current_quantity - 5000, updated_at = ? WHERE id = ?",
        )
        .run(timestamp, developmentSeedIds.chicken);
      database.sqlite
        .prepare(
          "INSERT INTO stock_movements (id, business_id, inventory_item_id, type, quantity_delta, balance_after, reason, created_by, created_at) VALUES (?, ?, ?, 'kitchen_issue', -5000, 25000, 'Lunch prep', ?, ?)",
        )
        .run(
          "00000000-0000-4000-8000-000000000130",
          developmentSeedIds.business,
          developmentSeedIds.chicken,
          developmentSeedIds.owner,
          timestamp,
        );
    })();
    expect(
      database.sqlite
        .prepare("SELECT current_quantity FROM inventory_items WHERE id = ?")
        .get(developmentSeedIds.chicken),
    ).toEqual({ current_quantity: 25000 });
    expect(
      database.sqlite
        .prepare(
          "SELECT quantity_delta, balance_after FROM stock_movements WHERE inventory_item_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
        )
        .get(developmentSeedIds.chicken),
    ).toEqual({ quantity_delta: -5000, balance_after: 25000 });
  });

  it("enforces foreign keys", () => {
    expect(database.sqlite.pragma("foreign_keys")).toEqual([
      { foreign_keys: 1 },
    ]);
    expect(() =>
      database.sqlite
        .prepare(
          "INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000140', 'missing-business', 'Broken', 1, 1, ?, ?)",
        )
        .run(timestamp, timestamp),
    ).toThrow();
  });

  it("rolls back payment and receipt writes together when receipt creation fails", () => {
    const orderId = insertOrder("00000000-0000-4000-8000-000000000141");
    database.sqlite.exec(
      "CREATE TRIGGER fail_receipt_write AFTER INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END",
    );
    expect(() => {
      database.sqlite.transaction(() => {
        database.sqlite
          .prepare(
            "INSERT INTO payments (id, business_id, order_id, amount_minor, method, status, received_by, received_at, created_at, updated_at) VALUES (?, ?, ?, 10000, 'cash', 'recorded', ?, ?, ?, ?)",
          )
          .run(
            "00000000-0000-4000-8000-000000000142",
            developmentSeedIds.business,
            orderId,
            developmentSeedIds.owner,
            timestamp,
            timestamp,
            timestamp,
          );
        database.sqlite
          .prepare(
            "UPDATE orders SET payment_status = 'paid' WHERE id = ? AND business_id = ?",
          )
          .run(orderId, developmentSeedIds.business);
        database.sqlite
          .prepare(
            "INSERT INTO receipts (id, business_id, receipt_number, order_id, issued_by, issued_at, total_minor, payment_summary, snapshot, created_at) VALUES (?, ?, 381, ?, ?, ?, 10000, '{}', '{}', ?)",
          )
          .run(
            "00000000-0000-4000-8000-000000000143",
            developmentSeedIds.business,
            orderId,
            developmentSeedIds.owner,
            timestamp,
            timestamp,
          );
      })();
    }).toThrow("injected receipt failure");
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM payments WHERE order_id = ?")
        .get(orderId),
    ).toEqual({ count: 0 });
    expect(
      database.sqlite
        .prepare("SELECT payment_status FROM orders WHERE id = ?")
        .get(orderId),
    ).toEqual({ payment_status: "unpaid" });
    expect(
      database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM receipts WHERE order_id = ?")
        .get(orderId),
    ).toEqual({ count: 0 });
  });

  it("keeps repository reads scoped to the requested business", () => {
    database.sqlite
      .prepare(
        "INSERT INTO businesses (id, name, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000150', 'Second business', 1, ?, ?)",
      )
      .run(timestamp, timestamp);
    database.sqlite
      .prepare(
        "INSERT INTO menu_categories (id, business_id, name, sort_order, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000151', '00000000-0000-4000-8000-000000000150', 'Drinks', 1, 1, ?, ?)",
      )
      .run(timestamp, timestamp);
    database.sqlite
      .prepare(
        "INSERT INTO menu_items (id, business_id, category_id, name, selling_price_minor, available, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000152', '00000000-0000-4000-8000-000000000150', '00000000-0000-4000-8000-000000000151', 'Private Drink', 100, 1, 1, ?, ?)",
      )
      .run(timestamp, timestamp);
    expect(
      createMenuRepository(database.db)
        .listAvailable(developmentSeedIds.business)
        .map((item) => item.name),
    ).not.toContain("Private Drink");
    expect(() =>
      database.sqlite
        .prepare(
          "INSERT INTO menu_items (id, business_id, category_id, name, selling_price_minor, available, active, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000153', ?, '00000000-0000-4000-8000-000000000151', 'Invalid cross-business item', 100, 1, 1, ?, ?)",
        )
        .run(developmentSeedIds.business, timestamp, timestamp),
    ).toThrow();
  });

  it("preserves historical order text if a menu item is later deleted", () => {
    const orderId = insertOrder();
    database.sqlite
      .prepare(
        "INSERT INTO order_items (id, business_id, order_id, menu_item_id, item_name_snapshot, unit_price_minor_snapshot, quantity, line_total_minor, created_at, updated_at) VALUES (?, ?, ?, ?, 'Fried Rice', 5000, 1, 5000, ?, ?)",
      )
      .run(
        "00000000-0000-4000-8000-000000000160",
        developmentSeedIds.business,
        orderId,
        developmentSeedIds.friedRice,
        timestamp,
        timestamp,
      );
    database.sqlite
      .prepare("DELETE FROM menu_items WHERE id = ?")
      .run(developmentSeedIds.friedRice);
    expect(
      database.sqlite
        .prepare(
          "SELECT menu_item_id, item_name_snapshot, unit_price_minor_snapshot FROM order_items WHERE id = '00000000-0000-4000-8000-000000000160'",
        )
        .get(),
    ).toEqual({
      menu_item_id: null,
      item_name_snapshot: "Fried Rice",
      unit_price_minor_snapshot: 5000,
    });
  });
});
