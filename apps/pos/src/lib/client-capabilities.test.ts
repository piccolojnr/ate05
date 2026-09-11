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
});
