import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserPreviewClient } from "./browser-preview-client";
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("retains partial payments and deduplicates retried payments across reloads", async () => {
  let client = createBrowserPreviewClient();
  await client.authenticateUser("00000000-0000-4000-8000-000000000002", "2468");
  const bootstrap = await client.bootstrap();
  const order = await client.addMenuItem({
    orderType: "takeaway",
    menuItemId: bootstrap.items[0]!.id,
  });
  const input = {
    orderId: order.id,
    method: "cash" as const,
    amountMinor: 1000,
    idempotencyKey: "partial-1",
    cashTenderedMinor: 2000,
  };
  await client.recordPayment(input);
  client = createBrowserPreviewClient();
  await client.authenticateUser("00000000-0000-4000-8000-000000000002", "2468");
  await client.recordPayment(input);
  expect(await client.listRevenuePayments()).toMatchObject([
    { id: "partial-1", amountMinor: 1000, orderPaid: false },
  ]);
  const paid = await client.recordPayment({
    ...input,
    idempotencyKey: "final",
    amountMinor: order.totalMinor - 1000,
    cashTenderedMinor: order.totalMinor,
  });
  expect(paid.receipt?.payments).toHaveLength(2);
  expect(
    (await client.listRevenuePayments()).every((payment) => payment.orderPaid),
  ).toBe(true);
});
it("denies direct access to financial reporting for cashiers", async () => {
  const client = createBrowserPreviewClient();
  await client.authenticateUser("preview-cashier", "1357");
  await expect(client.listRevenuePayments()).rejects.toThrow("permission");
});
