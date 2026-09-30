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
import type { PrinterInput } from "./client-capabilities";

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
  directory = mkdtempSync(join(tmpdir(), "ate05-native-printers-"));
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
        permissions: ["printers"],
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

describe("production printer client SQLite persistence", () => {
  it("saves, reloads and edits independent receipt/kitchen queues, and tests the persisted selection", async () => {
    const profiles: PrinterInput[] = [
      {
        role: "receipt",
        name: "Counter",
        connectionType: "system",
        queueName: "Generic / Text Only",
        address: "",
        port: null,
        paperWidth: 58,
        cutterEnabled: false,
        active: true,
      },
      {
        role: "kitchen",
        name: "Kitchen",
        connectionType: "system",
        queueName: "Kitchen Bluetooth — Thermal",
        address: "",
        port: null,
        paperWidth: 80,
        cutterEnabled: true,
        active: true,
      },
    ];
    const saved = [];
    for (const profile of profiles)
      saved.push(await client.savePrinter(profile));
    database.sqlite.close();
    database = createDatabase(path);
    client = await newClient();
    expect(await client.listPrinters()).toEqual(expect.arrayContaining(saved));
    for (const printer of saved) {
      await client.testPrinter(printer.id);
      expect(native.invoke).toHaveBeenCalledWith("test_printer", {
        request: {
          connectionType: "system",
          queueName: printer.queueName,
          address: "",
          port: null,
          paperWidth: printer.paperWidth,
          cutterEnabled: printer.cutterEnabled,
        },
        createdAt: expect.any(String),
      });
    }
    const receipt = saved.find((printer) => printer.role === "receipt")!;
    const edited = await client.savePrinter({
      ...receipt,
      queueName: "Replacement queue",
      paperWidth: 80,
    });
    await client.testPrinter(receipt.id);
    expect(native.invoke).toHaveBeenLastCalledWith("test_printer", {
      request: {
        connectionType: "system",
        queueName: "Replacement queue",
        address: "",
        port: null,
        paperWidth: 80,
        cutterEnabled: false,
      },
      createdAt: expect.any(String),
    });
    expect(await client.listPrinters()).toEqual(
      expect.arrayContaining([
        edited,
        saved.find((printer) => printer.role === "kitchen"),
      ]),
    );
  });

  it("retains network and legacy USB fields and does not change them when adding a system queue", async () => {
    const profiles: PrinterInput[] = [
      {
        name: "Receipt LAN",
        role: "receipt",
        connectionType: "network",
        address: "receipt.local",
        port: 9100,
        paperWidth: 58,
        cutterEnabled: false,
        active: true,
      },
      {
        name: "Legacy USB",
        role: "kitchen",
        connectionType: "usb",
        address: "legacy-device",
        port: null,
        paperWidth: 80,
        cutterEnabled: true,
        active: false,
      },
    ];
    const saved = [];
    for (const profile of profiles)
      saved.push(await client.savePrinter(profile));
    await client.savePrinter({
      name: "Windows kitchen",
      role: "kitchen",
      connectionType: "system",
      queueName: "Generic / Text Only",
      address: "",
      port: null,
      paperWidth: 80,
      cutterEnabled: true,
      active: true,
    });
    database.sqlite.close();
    database = createDatabase(path);
    client = await newClient();
    expect(await client.listPrinters()).toEqual(expect.arrayContaining(saved));
    for (const printer of saved)
      expect(await client.savePrinter(printer)).toEqual(printer);
    const network = saved.find(
      (printer) => printer.connectionType === "network",
    )!;
    await client.testPrinter(network.id);
    expect(native.invoke).toHaveBeenLastCalledWith("test_printer", {
      request: {
        connectionType: "network",
        queueName: null,
        address: "receipt.local",
        port: 9100,
        paperWidth: 58,
        cutterEnabled: false,
      },
      createdAt: expect.any(String),
    });
  });
});
