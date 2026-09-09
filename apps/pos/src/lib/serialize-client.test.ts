import { describe, expect, it } from "vitest";
import { serializeClient } from "./serialize-client";

describe("native operation serialization", () => {
  it("keeps reads and writes outside another client's transaction", async () => {
    const events: string[] = [];
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const beginning = new Promise<void>((resolve) => {
      started = resolve;
    });
    const writer = serializeClient({
      async save() {
        events.push("begin");
        started();
        await waiting;
        events.push("commit");
      },
    });
    const reader = serializeClient({
      async read() {
        events.push("read");
      },
    });
    const saving = writer.save();
    await beginning;
    const reading = reader.read();
    expect(events).toEqual(["begin"]);
    release();
    await Promise.all([saving, reading]);
    expect(events).toEqual(["begin", "commit", "read"]);
  });

  it("releases the lock after failure and permits internal method calls", async () => {
    const client = serializeClient({
      async fail() {
        throw new Error("write failed");
      },
      async read() {
        return 42;
      },
      async adjust() {
        return this.read();
      },
    });
    await expect(client.fail()).rejects.toThrow("write failed");
    await expect(client.adjust()).resolves.toBe(42);
  });
});
