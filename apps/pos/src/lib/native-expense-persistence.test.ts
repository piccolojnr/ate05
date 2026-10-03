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
import type { CreateExpenseInput } from "@ate05/domain";
import type { PosClient, SessionUser } from "./pos-client";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("./serialize-client", () => ({
  serializeClient: (client: object) => client,
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    get: () => ({
      select: async (sql: string, values: unknown[] = []) =>
        database.sqlite.prepare(sql).all(bindings(values)),
      execute: async (sql: string, values: unknown[] = []) =>
        database.sqlite.prepare(sql).run(bindings(values)),
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
let user: SessionUser;
const input: CreateExpenseInput = {
  id: "11111111-1111-4111-8111-111111111111",
  amountMinor: 12345,
  expenseDate: "2026-10-03",
  category: "Ingredients",
  description: "  Fresh vegetables  ",
  paymentMethod: "mobile_money",
};

async function newClient() {
  vi.resetModules();
  const { createTauriClient } = await import("./tauri-client");
  const next = createTauriClient();
  await next.authenticateUser(user.id, "2468");
  return next;
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "ate05-expenses-"));
  path = join(directory, "ate05.db");
  database = createDatabase(path);
  initializeDatabase(database.sqlite);
  seedDevelopmentData(database.sqlite);
  user = {
    id: developmentSeedIds.owner,
    businessId: developmentSeedIds.business,
    name: "Owner",
    role: "owner",
    permissions: ["expenses"],
  };
  native.invoke.mockReset().mockImplementation(async (command: string) => {
    if (command === "authenticate_user") return user;
    if (command === "lock_session") return null;
    throw new Error(`Unexpected command: ${command}`);
  });
  client = await newClient();
});
afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("native expenses against real SQLite", () => {
  it("survives reopening, makes create retries idempotent, and preserves original metadata on correction", async () => {
    const saved = await client.createExpense(input);
    expect(saved).toMatchObject({
      amountMinor: 12345,
      description: "Fresh vegetables",
      createdBy: user.id,
      version: 1,
    });
    expect(await client.createExpense(input)).toEqual(saved);
    database.sqlite.close();
    database = createDatabase(path);
    client = await newClient();
    expect(await client.listExpenses()).toEqual([saved]);
    const edited = await client.updateExpense({
      ...saved,
      amountMinor: 15000,
      description: "Vegetables and spices",
    });
    expect(edited).toMatchObject({
      id: saved.id,
      createdAt: saved.createdAt,
      createdBy: saved.createdBy,
      amountMinor: 15000,
      version: 2,
    });
    await expect(
      client.updateExpense({ ...saved, amountMinor: 20000 }),
    ).rejects.toThrow("has changed");
    expect(await client.listExpenses()).toEqual([edited]);
  });

  it("rejects invalid and conflicting saves without adding or changing records", async () => {
    await expect(
      client.createExpense({ ...input, amountMinor: 0 }),
    ).rejects.toThrow();
    await expect(
      client.createExpense({ ...input, expenseDate: "2026-02-30" }),
    ).rejects.toThrow();
    expect(await client.listExpenses()).toEqual([]);
    const saved = await client.createExpense(input);
    await expect(
      client.createExpense({ ...input, amountMinor: 1 }),
    ).rejects.toThrow("reference has already been used");
    await expect(
      client.updateExpense({ ...saved, description: "  " }),
    ).rejects.toThrow();
    expect(await client.listExpenses()).toEqual([saved]);
    // Database constraints also protect direct writes outside the form.
    expect(() =>
      database.sqlite.prepare("UPDATE expenses SET amount_minor = -1").run(),
    ).toThrow();
    expect(() =>
      database.sqlite.prepare("UPDATE expenses SET amount_minor = 1.5").run(),
    ).toThrow();
  });

  it("scopes reads and edits to the signed-in business", async () => {
    const saved = await client.createExpense(input);
    database.sqlite
      .prepare(
        "INSERT INTO businesses (id, name, created_at, updated_at) VALUES ('other-business', 'Other', 'now', 'now')",
      )
      .run();
    database.sqlite
      .prepare(
        "INSERT INTO users (id, business_id, name, role, active, created_at, updated_at) VALUES ('other-owner', 'other-business', 'Other owner', 'owner', 1, 'now', 'now')",
      )
      .run();
    user = { ...user, id: "other-owner", businessId: "other-business" };
    client = await newClient();
    expect(await client.listExpenses()).toEqual([]);
    await expect(
      client.updateExpense({ ...saved, amountMinor: 1 }),
    ).rejects.toThrow("not found");
    const own = await client.createExpense({
      ...input,
      id: "22222222-2222-4222-8222-222222222222",
    });
    expect(await client.listExpenses()).toEqual([own]);
  });

  it("requires expense permission for reads and writes and rejects locked sessions", async () => {
    user = { ...user, role: "cashier", permissions: ["pos"] };
    client = await newClient();
    await expect(client.listExpenses()).rejects.toThrow("permission");
    await expect(client.createExpense(input)).rejects.toThrow("permission");
    await expect(
      client.updateExpense({ ...input, version: 1 }),
    ).rejects.toThrow("permission");
    await client.lockSession();
    await expect(client.listExpenses()).rejects.toThrow("sign in");
  });

  it("sorts by expense date rather than entry time", async () => {
    const recent = await client.createExpense(input);
    const older = await client.createExpense({
      ...input,
      id: "22222222-2222-4222-8222-222222222222",
      expenseDate: "2026-10-01",
    });
    expect((await client.listExpenses()).map((expense) => expense.id)).toEqual([
      recent.id,
      older.id,
    ]);
  });
});
