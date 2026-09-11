import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  if (await page.getByLabel("Staff PIN").count()) {
    await page.getByLabel("Staff PIN").fill("2468");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByLabel("Current order")).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await signIn(page);
});

test("cashier can create, persist, and reopen a local order", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await expect(page.getByLabel("Current order")).toBeVisible();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  await expect(page.getByLabel("Current order")).toContainText("#0001");
  await page.getByLabel("Increase Fried Rice").click();
  await page.getByLabel("Note for Fried Rice").fill("No pepper");
  await page.getByLabel("Note for Fried Rice").blur();
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Send to Kitchen" }).click();
  await expect(page.getByLabel("Current order")).toContainText(
    "1 print pending",
  );
  await page.getByRole("button", { name: "Add Chicken Wings" }).click();
  await expect(page.getByLabel("Current order")).toContainText(
    "Changes pending",
  );
  await page.getByRole("button", { name: "Send to Kitchen" }).click();
  await expect(page.getByLabel("Current order")).toContainText("Ticket #2");
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: "Open Order" }).first().click();
  await expect(page.getByLabel("Note for Fried Rice")).toHaveValue("No pepper");
  await expect(page.getByLabel("Current order")).toContainText("Ticket #1");
  await expect(page.getByLabel("Current order")).toContainText("Ticket #2");
  await expect(page.getByLabel("Current order")).toContainText(
    "GHS 135.00 due",
  );
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.getByLabel("Current order")).toContainText("PAID");
  await expect(page.getByLabel("Current order")).toContainText(
    "Receipt #000001",
  );
  await page.getByRole("button", { name: "Reprint Receipt" }).click();
  await expect(
    page
      .getByRole("region", { name: /Notifications/ })
      .getByRole("listitem")
      .filter({ hasText: "Receipt reprinted" }),
  ).toBeVisible();
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("button", { name: "Open Order" }).first().click();
  await expect(page.getByLabel("Current order")).toContainText("GHS 135.00");
});

test("renders local seating data", async ({ page }) => {
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
  await expect(page.getByText("Table 1")).toBeVisible();
});

test("operator can turn over a table through explicit order completion", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Tables" }).click();
  await page.getByRole("button", { name: "Add Table" }).click();
  await page.getByRole("dialog").getByLabel("Table name").fill("Patio 1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add table" })
    .click();
  await expect(page.getByText("Patio 1")).toBeVisible();
  await page.getByRole("button", { name: "Start Order" }).last().click();
  await page.getByRole("button", { name: "Add Fried Rice" }).click();
  await expect(page.getByLabel("Current order")).toContainText("Patio 1");

  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByText("Active order at this table")).toBeVisible();
  await page.getByRole("button", { name: "Open Order" }).click();
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByText("Active order at this table")).toBeVisible();

  await page.getByRole("button", { name: "Open Order" }).click();
  await page
    .getByRole("button", { name: "Complete Order · Release Table" })
    .click();
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(
    page.getByText("Available for a new dine-in order").last(),
  ).toBeVisible();
});

test("operator can manage persisted menu items and use them in POS", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await page.getByRole("button", { name: "New Menu Item" }).click();
  await page.getByLabel("Item name").fill("Garden Salad");
  await page.getByLabel("Price (GHS)").fill("28.50");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText("Garden Salad").first()).toBeVisible();
  await page.getByRole("button", { name: "POS", exact: true }).click();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByLabel("Search menu").fill("Garden Salad");
  await expect(
    page.getByRole("button", { name: "Add Garden Salad" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Garden Salad" }).click();
  await expect(page.getByLabel("Current order")).toContainText("GHS 28.50");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Edit Garden Salad" }).click();
  await page.getByLabel("Price (GHS)").fill("30.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "POS", exact: true }).click();
  await page.getByLabel("Search menu").fill("Garden Salad");
  await expect(
    page.getByRole("button", { name: "Add Garden Salad" }),
  ).toContainText("30.00");
});

test("cashier can receive, issue, and inspect inventory movements", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Inventory" }).click();
  await page.getByRole("button", { name: "New Inventory Item" }).click();
  await page.getByLabel("Inventory item name").fill("Rice stock");
  await page.getByLabel("Inventory unit").selectOption("g");
  await page.getByLabel("Starting quantity").fill("10000");
  await page.getByLabel("Reorder threshold").fill("2000");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("heading", { name: "Rice stock" })).toBeVisible();
  await expect(page.getByText("10,000 g").first()).toBeVisible();
  await page.getByRole("button", { name: "Receive Stock" }).click();
  await page.getByLabel("Movement quantity").fill("3000");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByText("13,000 g").first()).toBeVisible();
  await page.getByRole("button", { name: "Issue to Kitchen" }).click();
  await page.getByLabel("Movement quantity").fill("1000");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByText("12,000 g").first()).toBeVisible();
  await expect(page.getByText("Receive").first()).toBeVisible();
  await expect(page.getByText("Kitchen issue").first()).toBeVisible();
});

test("operator can configure independent kitchen and receipt printers", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Not configured").first()).toBeVisible();

  await page.getByLabel("Kitchen Printer name").fill("Kitchen TCP");
  await page.getByLabel("Kitchen Printer address").fill("kitchen.local");
  await page.getByRole("button", { name: "Save changes" }).nth(0).click();
  await expect(page.getByText("Configured · Enabled").first()).toBeVisible();
  await page.getByRole("button", { name: "Test print" }).nth(0).click();
  await expect(
    page.getByText(
      "Preview test succeeded. No physical printer was contacted.",
    ),
  ).toBeVisible();

  await page.getByLabel("Receipt Printer name").fill("Receipt TCP");
  await page.getByLabel("Receipt Printer address").fill("receipt.local");
  await page.getByRole("button", { name: "Save changes" }).nth(1).click();
  await expect(page.getByText("Configured · Enabled").nth(1)).toBeVisible();
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Kitchen Printer address")).toHaveValue(
    "kitchen.local",
  );
  await expect(page.getByLabel("Receipt Printer address")).toHaveValue(
    "receipt.local",
  );
});

test("browser preview explains that database backups are native-only", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Protect local restaurant data" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Backup and restore are available in the native desktop app.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back Up Now" }),
  ).toBeDisabled();
});
