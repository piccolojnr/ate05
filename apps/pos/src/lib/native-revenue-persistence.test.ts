import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDatabase,
  initializeDatabase,
  seedDevelopmentData,
  developmentSeedIds,
} from "../../../../packages/database/src/index";
import type { PosClient } from "./pos-client";
import { buildRevenueReport } from "@ate05/domain";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
// Exercise the production client SQL against real SQLite. Only IPC and the
// browser's lock wrapper are substituted; no fake printer-row store is used.
vi.mock("./serialize-client", () => ({
  serializeClient: (client: object) => client,
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    get: () => ({
      select: async (sql: string, values: unknown[] = []) => {
        const statement = database.sqlite.prepare(sql);
        return values.length
          ? statement.all(bindings(values))
          : statement.all();
      },
      execute: async (sql: string, values: unknown[] = []) => {
        const statement = database.sqlite.prepare(sql);
        return values.length
          ? statement.run(bindings(values))
          : statement.run();
      },
    }),
  },
}));

function bindings(values: unknown[]) {
  return Object.fromEntries(
    values.map((value, index) => [String(index + 1), value]),
  );
}

let directory: string;
let path: string;
let database: ReturnType<typeof createDatabase>;
let client: PosClient;

async function newClient() {
  vi.resetModules();
  const { createTauriClient } = await import("./tauri-client");
  const client = createTauriClient();
  await client.authenticateUser(developmentSeedIds.owner, "2468");
  return client;
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "ate05-native-revenue-"));
  path = join(directory, "ate05.db");
  database = createDatabase(path);
  initializeDatabase(database.sqlite);
  seedDevelopmentData(database.sqlite);
  native.invoke.mockReset().mockImplementation(async (command: string) => {
    if (command === "authenticate_user")
      return {
        id: developmentSeedIds.owner,
        businessId: developmentSeedIds.business,
        name: "Owner",
        role: "owner",
        permissions: ["reports"],
      };
    if (command === "test_printer") return null;
    throw new Error(`Unexpected native command: ${command}`);
  });
  client = await newClient();
});

afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("native revenue payments", () => {
  it("reads payments without requiring receipts, isolates business records and persists on reopen", async () => {
    const now = "2026-10-04T12:00:00Z";
    database.sqlite
      .prepare(
        "INSERT INTO orders (id,business_id,order_number,order_type,status,payment_status,subtotal_minor,total_minor,opened_at,created_at,updated_at) VALUES ('o1',?,1,'takeaway','open','partially_paid',5000,5000,?,?,?)",
      )
      .run(developmentSeedIds.business, now, now, now);
    database.sqlite
      .prepare(
        "INSERT INTO payments (id,business_id,order_id,amount_minor,method,status,received_at,created_at,updated_at) VALUES ('p1',?,'o1',2500,'cash','recorded',?,?,?)",
      )
      .run(developmentSeedIds.business, now, now, now);
    database.sqlite
      .prepare(
        "INSERT INTO payments (id,business_id,order_id,amount_minor,method,status,received_at,created_at,updated_at) VALUES ('p2',?,'o1',1000,'card','voided',?,?,?)",
      )
      .run(developmentSeedIds.business, now, now, now);
    database.sqlite
      .prepare(
        "INSERT INTO businesses (id,name,created_at,updated_at) VALUES ('other','Other',?,?)",
      )
      .run(now, now);
    database.sqlite
      .prepare(
        "INSERT INTO orders (id,business_id,order_number,order_type,status,payment_status,subtotal_minor,total_minor,opened_at,created_at,updated_at) VALUES ('o2','other',1,'takeaway','completed','paid',9900,9900,?,?,?)",
      )
      .run(now, now, now);
    database.sqlite
      .prepare(
        "INSERT INTO payments (id,business_id,order_id,amount_minor,method,status,received_at,created_at,updated_at) VALUES ('p3','other','o2',9900,'cash','recorded',?,?,?)",
      )
      .run(now, now, now);
    database.sqlite.close();
    database = createDatabase(path);
    client = await newClient();
    const payments = await client.listRevenuePayments();
    expect(payments.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(
      buildRevenueReport(payments, { start: "2026-10-04", end: "2026-10-04" }),
    ).toMatchObject({ totalMinor: 2500, paidOrderCount: 0, paymentCount: 1 });
  });
  it("requires a report permission before reading financial records", async () => {
    native.invoke.mockResolvedValue({
      id: developmentSeedIds.owner,
      businessId: developmentSeedIds.business,
      name: "Cashier",
      role: "cashier",
      permissions: ["orders"],
    });
    client = await newClient();
    await expect(client.listRevenuePayments()).rejects.toThrow(/permission/i);
  });
});
