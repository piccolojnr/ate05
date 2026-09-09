import { describe, expect, it } from "vitest";
import { isTauriRuntime } from "./get-pos-client";
import { PosClientError } from "./tauri-client";

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
});
