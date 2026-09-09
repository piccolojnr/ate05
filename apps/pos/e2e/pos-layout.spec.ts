import { expect, test } from "@playwright/test";

test("action errors dismiss automatically and can be paused or dismissed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add Fried Rice" }),
  ).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  const error = page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: /table/i });
  await expect(error).toContainText(/table/i);
  await error.hover();
  await page.screenshot({ path: "/tmp/ate05-sonner-error.png" });
  await page.clock.fastForward(9000);
  await expect(error).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(8100);
  await expect(error).toHaveCount(0);
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  await expect(error).toBeVisible();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(error).toHaveCount(0);
});

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
]) {
  test(`order scroll keeps totals and actions visible at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    await page.getByRole("button", { name: "Takeaway" }).click();
    await page.getByRole("button", { name: "Add Fried Rice" }).click();
    await expect(page.getByLabel("Current order")).toContainText("#0001");
    // Expand the persisted preview fixture to exercise a long restaurant order.
    await page.evaluate(() => {
      const key = "ate05-pos-browser-preview-v1";
      const state = JSON.parse(localStorage.getItem(key)!);
      const order = state.orders[0];
      order.items = Array.from({ length: 20 }, (_, index) => ({
        ...order.items[0],
        id: `line-${index}`,
        name: `Rice ${index + 1}`,
      }));
      order.kitchenChangesPending = true;
      order.subtotalMinor *= 20;
      order.totalMinor *= 20;
      order.amountDueMinor = order.totalMinor;
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await page
      .getByRole("button", { name: "Open Order", exact: true })
      .first()
      .click();
    const action = page.getByRole("button", {
      name: "Take Payment",
      exact: true,
    });
    await expect(action).toBeInViewport();
    const before = await action.boundingBox();
    const items = page.getByRole("region", {
      name: "Order items",
      exact: true,
    });
    await items.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await items.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    expect(await action.boundingBox()).toEqual(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Send to Kitchen", exact: true }),
    ).toBeInViewport();
    await action.click();
    await expect(page.getByLabel("Payment amount")).toBeFocused();
    await expect(page.getByLabel("Payment amount")).toBeInViewport();
    await page.screenshot({ path: `/tmp/ate05-pos-${width}x${height}.png` });
  });
}
