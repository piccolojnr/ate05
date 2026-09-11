import { describe, expect, it } from "vitest";
import { createBrowserPreviewClient } from "./browser-preview-client";
import { createTauriClient } from "./tauri-client";
import type { PosClient } from "./pos-client";

const capabilityMethods = [
  "authBootstrap",
  "bootstrap",
  "listMenuManagement",
  "addMenuItem",
  "recordPayment",
  "sendOrderToKitchen",
  "createTable",
  "listInventory",
  "listPrinters",
  "listBackups",
] as const;

function expectClientCapabilities(client: PosClient): void {
  for (const method of capabilityMethods) {
    expect(client[method]).toEqual(expect.any(Function));
  }
}

describe("POS client capability boundary", () => {
  it("keeps the native client composed from the capability contracts", () => {
    expectClientCapabilities(createTauriClient());
  });

  it("keeps the browser preview composed from the same capability contracts", () => {
    expectClientCapabilities(createBrowserPreviewClient());
  });

  it("persists only the remembered browser staff identity", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      },
    });
    const client = createBrowserPreviewClient();

    await client.rememberStaff("preview-cashier");

    expect(await client.getRememberedStaffId()).toBe("preview-cashier");
    expect([...values.values()]).toEqual(["preview-cashier"]);
    expect([...values.values()].join(" ")).not.toContain("1357");

    await client.forgetRememberedStaff();
    expect(await client.getRememberedStaffId()).toBeNull();
  });
});
