import { expect, test, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00Z") });
  await page.goto("/");
  if (!(await page.getByLabel("Staff PIN").count()))
    await page.getByRole("button", { name: /ATE05 Owner/ }).click();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
  await page.getByRole("button", { name: "Takeaway", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Fried Rice", exact: true })
    .click();
  await page.evaluate(() => {
    const key = "ate05-pos-browser-preview-v1",
      state = JSON.parse(localStorage.getItem(key)!);
    const template = state.orders[0];
    state.orders = [
      {
        ...template,
        id: "today",
        orderNumber: 5,
        openedAt: "2026-10-07T09:00:00Z",
      },
      {
        ...template,
        id: "monday",
        orderNumber: 4,
        openedAt: "2026-10-05T00:00:00Z",
        status: "completed",
        paymentStatus: "paid",
        amountPaidMinor: 5000,
        amountDueMinor: 0,
      },
      {
        ...template,
        id: "sunday",
        orderNumber: 3,
        openedAt: "2026-10-04T23:59:59Z",
        status: "completed",
      },
      {
        ...template,
        id: "old-active",
        orderNumber: 2,
        openedAt: "2026-09-30T10:00:00Z",
      },
      {
        ...template,
        id: "unknown",
        orderNumber: 1,
        openedAt: "unknown",
        status: "completed",
      },
    ];
    state.nextOrderNumber = 6;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByLabel("Staff PIN")).toBeVisible();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
}
test("defaults to this week, groups days, labels dates and keeps old active orders discoverable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await expect(page.getByLabel("Order date range")).toContainText(
    "Monday, 5 Oct 2026 – Sunday, 11 Oct 2026 · Monday to Sunday",
  );
  const today = page.getByRole("region", {
    name: "Wednesday, 7 Oct 2026",
    exact: true,
  });
  await expect(today).toContainText("#0005");
  await expect(
    page.getByRole("region", { name: "Monday, 5 Oct 2026", exact: true }),
  ).toContainText("#0004");
  await expect(page.getByText("#0003", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("1 active order is outside this date range."),
  ).toBeVisible();
  await expect(page.getByLabel("Order details")).toContainText(
    "Wednesday, 7 Oct 2026",
  );
  await page.screenshot({ path: "/tmp/ate05-order-history-1440.png" });
  await page
    .getByRole("button", { name: "View all active orders", exact: true })
    .click();
  await expect(page.getByLabel("Order period")).toHaveValue("all");
  await expect(
    page.getByRole("region", { name: "Wednesday, 30 Sept 2026", exact: true }),
  ).toContainText("#0002");
  await expect(page.getByText("#0004", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search orders").fill("2");
  await page
    .getByRole("button", { name: "Open Order", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Current order")).toContainText("0002");
});
test("navigates week boundaries, searches within a period and supports custom/invalid ranges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setup(page);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(page.getByLabel("Order date range")).toContainText(
    "Monday, 28 Sept 2026 – Sunday, 4 Oct 2026",
  );
  await expect(
    page.getByRole("region", { name: "Sunday, 4 Oct 2026", exact: true }),
  ).toContainText("#0003");
  await page.getByLabel("Search orders").fill("3");
  await expect(page.getByText("#0002", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search orders").fill("");
  await page.screenshot({ path: "/tmp/ate05-order-history-1024.png" });
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next week", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Order period").selectOption("custom");
  await page.getByLabel("Order start date").fill("2026-09-30");
  await page.getByLabel("Order end date").fill("2026-10-05");
  await expect(page.getByText("#0005", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Monday, 5 Oct 2026", exact: true }),
  ).toContainText("#0004");
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await expect(page.getByText("#0003", { exact: true })).toHaveCount(0);
  await page.getByLabel("Order end date").fill("2026-09-29");
  await expect(page.getByRole("alert")).toContainText("on or before");
  await expect(page.getByText("#0004", { exact: true })).toHaveCount(0);
});
test("all dates preserves orders with unknown dates and empty weeks explain recovery", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Order period").selectOption("all");
  await expect(
    page.getByRole("region", { name: "Unknown date", exact: true }),
  ).toContainText("#0001");
  await page.getByLabel("Order period").selectOption("week");
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(page.getByText("No orders in this view")).toBeVisible();
  await expect(
    page.getByText("Try another week, date range, or status filter."),
  ).toBeVisible();
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Wednesday, 7 Oct 2026", exact: true }),
  ).toBeVisible();
});
