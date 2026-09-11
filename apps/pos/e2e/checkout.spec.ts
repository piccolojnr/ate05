import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  if (!(await page.getByLabel("Staff PIN").count())) {
    await page.getByRole("button", { name: /ATE05 Owner/ }).click();
  }
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}

async function dismissNotifications(page: import("@playwright/test").Page) {
  const buttons = page.getByRole("button", { name: "Dismiss notification" });
  for (let index = await buttons.count(); index > 0; index -= 1)
    await buttons.first().click();
}

test("checkout reviews tenders and renders the receipt result", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  await page.getByRole("button", { name: "Take Payment" }).click();

  await page.screenshot({
    path: "docs/artifacts/checkout-1024-review.png",
  });

  await page.getByRole("button", { name: "Mobile money" }).click();
  await page.getByLabel("Payment amount").fill("25.00");
  await page.getByLabel("Payment reference").fill("MM-123");
  await page.screenshot({
    path: "docs/artifacts/checkout-non-cash-review.png",
  });
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.getByLabel("Checkout")).toContainText("Payment recorded");
  await expect(page.getByLabel("Checkout")).toContainText("GHS 25.00");

  await page.getByRole("button", { name: "Cash" }).click();
  await page.getByLabel("Payment amount").fill("25.00");
  await page.getByLabel("Cash tendered").fill("50.00");
  await page.screenshot({
    path: "docs/artifacts/checkout-cash-change.png",
  });
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.getByLabel("Checkout")).toContainText("Receipt ready");
  await expect(page.getByLabel("Checkout")).toContainText("#000001");
  await dismissNotifications(page);
  await page.getByLabel("Checkout").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: "docs/artifacts/checkout-receipt-result.png",
  });
});

test("checkout shows an inline cash validation error", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  await page.getByRole("button", { name: "Take Payment" }).click();
  await page.getByLabel("Cash tendered").fill("1.00");
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cash tendered must cover the payment",
  );
  await page.screenshot({
    path: "docs/artifacts/checkout-1440-validation-error.png",
  });
});
