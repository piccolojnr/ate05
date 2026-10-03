import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDatabase,
  initializeDatabase,
  seedDevelopmentData,
  developmentSeedIds,
  printers,
} from "./index";

const timestamp = "2026-09-30T12:00:00.000Z";

describe("installed printer queue persistence", () => {
  it("upgrades schema 6 through the real Drizzle migrator without changing network/USB rows or history", () => {
    const directory = mkdtempSync(join(tmpdir(), "ate05-printer-upgrade-"));
    const path = join(directory, "ate05.db");
    let database = createDatabase(path);
    try {
      const journal = JSON.parse(
        readFileSync(
          new URL("../drizzle/meta/_journal.json", import.meta.url),
          "utf8",
        ),
      ) as {
        entries: { tag: string; when: number }[];
      };
      // Reproduce the installed pre-queue schema and its real migration history.
      // initializeDatabase must apply only 0006, inside its normal transaction.
      database.sqlite.exec(
        'CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)',
      );
      const history = database.sqlite.prepare(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
      );
      for (const entry of journal.entries.slice(0, 6)) {
        const sql = readFileSync(
          new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
          "utf8",
        );
        database.sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
        history.run(createHash("sha256").update(sql).digest("hex"), entry.when);
      }
      seedDevelopmentData(database.sqlite);
      const insert = database.sqlite.prepare(
        "INSERT INTO printers (id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insert.run(
        "network",
        developmentSeedIds.business,
        "Receipt LAN",
        "receipt",
        "network",
        "receipt.local",
        9200,
        58,
        0,
        1,
        timestamp,
        timestamp,
      );
      insert.run(
        "usb",
        developmentSeedIds.business,
        "Legacy USB",
        "kitchen",
        "usb",
        "legacy-device",
        null,
        80,
        1,
        0,
        timestamp,
        timestamp,
      );
      for (const printerId of ["network", "usb", null]) {
        database.sqlite
          .prepare(
            "INSERT INTO print_attempts (id, business_id, document_type, document_id, printer_id, context, attempted_at, success) VALUES (?, ?, 'test', 'test-document', ?, 'test', ?, 1)",
          )
          .run(
            `attempt-${printerId ?? "unconfigured"}`,
            developmentSeedIds.business,
            printerId,
            timestamp,
          );
      }
      const before = database.sqlite
        .prepare("SELECT * FROM printers ORDER BY id")
        .all();
      const attempts = database.sqlite
        .prepare("SELECT * FROM print_attempts ORDER BY id")
        .all();
      initializeDatabase(database.sqlite);
      initializeDatabase(database.sqlite); // Re-running startup must be idempotent.
      database.sqlite.close();
      database = createDatabase(path);
      expect(
        database.sqlite
          .prepare(
            "SELECT id, business_id, name, role, connection_type, address, port, paper_width, cutter_enabled, active, created_at, updated_at FROM printers ORDER BY id",
          )
          .all(),
      ).toEqual(before);
      expect(
        database.sqlite
          .prepare("SELECT * FROM print_attempts ORDER BY id")
          .all(),
      ).toEqual(attempts);
      expect(
        database.sqlite.prepare("SELECT queue_name FROM printers").all(),
      ).toEqual([{ queue_name: null }, { queue_name: null }]);
      expect(
        database.sqlite
          .prepare('SELECT COUNT(*) AS count FROM "__drizzle_migrations"')
          .get(),
      ).toEqual({ count: 8 });
      expect(
        database.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE name IN ('__new_printers', '__printer_history_links')",
          )
          .all(),
      ).toEqual([]);
      expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(database.sqlite.prepare("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
    } finally {
      database.sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("persists receipt and kitchen queue profiles exactly across restart and updates", () => {
    const directory = mkdtempSync(join(tmpdir(), "ate05-system-printers-"));
    const path = join(directory, "ate05.db");
    let database = createDatabase(path);
    try {
      initializeDatabase(database.sqlite);
      seedDevelopmentData(database.sqlite);
      const profiles = [
        {
          id: "receipt",
          name: "Front counter",
          role: "receipt",
          queueName: "Generic / Text Only",
          paperWidth: 58,
          cutterEnabled: false,
        },
        {
          id: "kitchen",
          name: "Preparation area",
          role: "kitchen",
          queueName: "Kitchen Bluetooth — Thermal",
          paperWidth: 80,
          cutterEnabled: true,
        },
      ].map((profile) => ({
        ...profile,
        businessId: developmentSeedIds.business,
        connectionType: "system",
        address: "",
        port: null,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      database.db.insert(printers).values(profiles).run();
      database.sqlite.close();
      database = createDatabase(path);
      initializeDatabase(database.sqlite);
      expect(
        database.db.select().from(printers).orderBy(printers.id).all(),
      ).toEqual([profiles[1], profiles[0]]);
      database.db
        .update(printers)
        .set({
          queueName: "New receipt queue",
          paperWidth: 80,
          cutterEnabled: true,
        })
        .where(eq(printers.id, "receipt"))
        .run();
      expect(
        database.db
          .select()
          .from(printers)
          .where(eq(printers.id, "receipt"))
          .get(),
      ).toEqual({
        ...profiles[0],
        queueName: "New receipt queue",
        paperWidth: 80,
        cutterEnabled: true,
      });
      expect(
        database.db
          .select()
          .from(printers)
          .where(eq(printers.id, "kitchen"))
          .get(),
      ).toEqual(profiles[1]);
    } finally {
      database.sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires a queue name and excludes TCP fields only for system configurations", () => {
    const database = createDatabase();
    try {
      initializeDatabase(database.sqlite);
      seedDevelopmentData(database.sqlite);
      const profile = {
        id: "receipt",
        businessId: developmentSeedIds.business,
        name: "Receipt",
        role: "receipt",
        connectionType: "system",
        address: "",
        queueName: "Generic / Text Only",
        port: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      database.db.insert(printers).values(profile).run();
      for (const change of [
        { queueName: null },
        { queueName: " " },
        { address: "USB001" },
        { port: 9100 },
      ]) {
        expect(() =>
          database.db
            .update(printers)
            .set(change)
            .where(eq(printers.id, profile.id))
            .run(),
        ).toThrow();
      }
      expect(database.db.select().from(printers).get()).toMatchObject(profile);
    } finally {
      database.sqlite.close();
    }
  });
});
