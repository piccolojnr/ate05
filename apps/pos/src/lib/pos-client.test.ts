import { describe, expect, it } from "vitest";
import { isTauriRuntime } from "./get-pos-client";
import { PosClientError } from "./client-errors";

describe("POS client boundary", () => {
  it("selects the native path only when the Tauri runtime marker is present", () => {
    expect(isTauriRuntime({})).toBe(false);
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
  });

  it("exposes structured cashier-safe native errors", () => {
    const error = new PosClientError(
      "unavailable",
      "This menu item is unavailable.",
    );
    expect(error).toMatchObject({
      code: "unavailable",
      message: "This menu item is unavailable.",
    });
  });

  it("keeps operational error codes separate from cashier-facing messages", () => {
    const error = new PosClientError(
      "duplicate_active_table_order",
      "This table already has an active order.",
    );

    expect(error.code).toBe("duplicate_active_table_order");
    expect(error.message).toBe("This table already has an active order.");
  });
});
