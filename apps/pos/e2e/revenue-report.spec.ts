import { expect, test, type Page } from "@playwright/test";
async function signIn(page: Page, cashier = false) {
  if (!(await page.getByLabel("Staff PIN").count()))
    await page
      .getByRole("button", {
        name: cashier ? /Preview Cashier/ : /ATE05 Owner/,
      })
      .click();
  await page.getByLabel("Staff PIN").fill(cashier ? "1357" : "2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}
async function report(page: Page) {
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revenue report", exact: true }),
  ).toBeVisible();
}
test("reports split payments, cash change and persisted totals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Takeaway", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Fried Rice", exact: true })
    .click();
  await page.getByRole("button", { name: "Take Payment", exact: true }).click();
  await page.getByRole("button", { name: "Mobile money", exact: true }).click();
  await page.getByLabel("Payment amount").fill("25.00");
  await page
    .getByRole("button", { name: "Confirm Payment", exact: true })
    .click();
  await expect(page.getByLabel("Checkout")).toContainText("Payment recorded");
  // Navigate via the app after leaving checkout.
  await page
    .getByRole("button", { name: "Return to order", exact: true })
    .click();
  await report(page);
  await expect(page.getByTestId("revenue-total")).toHaveText("GHS 25.00");
  await expect(page.getByLabel("Revenue summary")).toContainText(
    "Paid orders0",
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Order", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Take Payment", exact: true }).click();
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Payment amount").fill("25.00");
  await page.getByLabel("Cash tendered").fill("50.00");
  await page
    .getByRole("button", { name: "Confirm Payment", exact: true })
    .click();
  await expect(page.getByLabel("Checkout")).toContainText("Receipt ready");
  await page
    .getByRole("button", { name: "Return to order", exact: true })
    .click();
  await report(page);
  await expect(page.getByTestId("revenue-total")).toHaveText("GHS 50.00");
  await expect(page.getByLabel("Revenue summary")).toContainText(
    "Payments received2",
  );
  await expect(page.getByLabel("Revenue summary")).toContainText(
    "Paid orders1",
  );
  await expect(page.getByRole("table").first()).toContainText("Mobile money");
  await expect(page.getByRole("table").first()).toContainText("Cash");
  await page.screenshot({ path: "/tmp/ate05-revenue-1024.png" });
});
test("custom boundaries exclude refunds and voids and show empty/invalid periods", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);
  await page.evaluate(() => {
    const key = "ate05-pos-browser-preview-v1";
    const state = JSON.parse(
      localStorage.getItem(key) ??
        '{"nextOrderNumber":1,"nextReceiptNumber":1,"orders":[],"printers":[],"inventory":[],"movements":[]}',
    );
    state.revenuePayments = [
      {
        id: "p1",
        orderId: "o1",
        amountMinor: 12345,
        method: "cash",
        status: "recorded",
        receivedAt: "2026-09-28T00:00:00Z",
        orderPaid: true,
      },
      {
        id: "p2",
        orderId: "o1",
        amountMinor: 5000,
        method: "card",
        status: "recorded",
        receivedAt: "2026-10-04T23:59:59Z",
        orderPaid: true,
      },
      {
        id: "p3",
        orderId: "o2",
        amountMinor: 9000,
        method: "cash",
        status: "refunded",
        receivedAt: "2026-10-01T12:00:00Z",
        orderPaid: false,
      },
      {
        id: "p4",
        orderId: "o3",
        amountMinor: 9000,
        method: "cash",
        status: "voided",
        receivedAt: "2026-10-01T12:00:00Z",
        orderPaid: false,
      },
      {
        id: "p5",
        orderId: "o4",
        amountMinor: 9000,
        method: "cash",
        status: "recorded",
        receivedAt: "2026-10-05T00:00:00Z",
        orderPaid: false,
      },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await report(page);
  await page.getByLabel("Report period").selectOption("custom");
  await page.getByLabel("Report start date").fill("2026-09-28");
  await page.getByLabel("Report end date").fill("2026-10-04");
  await expect(page.getByTestId("revenue-total")).toHaveText("GHS 173.45");
  await expect(page.getByLabel("Revenue summary")).toContainText(
    "Paid orders1",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "/tmp/ate05-revenue-1440.png" });
  await page.getByLabel("Report end date").fill("2026-09-27");
  await expect(page.getByRole("alert")).toContainText("on or before");
  await expect(page.getByTestId("revenue-total")).toHaveCount(0);
  await page.getByLabel("Report start date").fill("2026-08-01");
  await page.getByLabel("Report end date").fill("2026-08-31");
  await expect(page.getByTestId("revenue-total")).toHaveText("GHS 0.00");
  await expect(page.getByText("No payments in this period")).toBeVisible();
  await page.getByLabel("Report period").selectOption("week");
  await expect(page.getByLabel("Report date range")).toContainText(
    "Monday to Sunday",
  );
});
test("refresh hides stale totals when payment data is invalid", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);
  await report(page);
  await expect(page.getByTestId("revenue-total")).toHaveText("GHS 0.00");
  await page.evaluate(() => {
    const key = "ate05-pos-browser-preview-v1",
      state = JSON.parse(
        localStorage.getItem(key) ??
          '{"nextOrderNumber":1,"nextReceiptNumber":1,"orders":[],"printers":[],"inventory":[],"movements":[]}',
      );
    state.revenuePayments = [
      {
        id: "bad",
        orderId: "o",
        amountMinor: 100,
        method: "cash",
        status: "recorded",
        receivedAt: "bad date",
        orderPaid: false,
      },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.getByRole("button", { name: "Refresh report" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid date");
  await expect(page.getByTestId("revenue-total")).toHaveCount(0);
});
test("cashiers cannot access reports", async ({ page }) => {
  await page.goto("/");
  await signIn(page, true);
  await expect(
    page.getByRole("button", { name: "Reports", exact: true }),
  ).toHaveCount(0);
});
