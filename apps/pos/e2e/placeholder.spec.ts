import { expect, test } from "@playwright/test";

test("cashier can create, persist, and reopen a local order", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
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
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("button", { name: "Open Order" }).first().click();
  await expect(page.getByLabel("Current order")).toContainText("GHS 135.00");
});

test("renders local seating data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
  await expect(page.getByText("T1")).toBeVisible();
});

test("cashier can receive, issue, and inspect inventory movements", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory" }).click();
  await page.getByLabel("Inventory item name").fill("Rice stock");
  await page.getByLabel("Inventory unit").selectOption("g");
  await page.getByLabel("Starting quantity").fill("10000");
  await page.getByLabel("Reorder threshold").fill("2000");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(
    page.getByRole("heading", { name: "Rice stock · 10000 g" }),
  ).toBeVisible();
  await page.getByLabel("Stock action").selectOption("receive");
  await page.getByLabel("Movement quantity").fill("3000");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(
    page.getByRole("heading", { name: "Rice stock · 13000 g" }),
  ).toBeVisible();
  await page.getByLabel("Stock action").selectOption("issue");
  await page.getByLabel("Movement quantity").fill("1000");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(
    page.getByRole("heading", { name: "Rice stock · 12000 g" }),
  ).toBeVisible();
  await expect(page.getByText(/purchase/).first()).toBeVisible();
  await expect(page.getByText(/kitchen_issue/).first()).toBeVisible();
});
