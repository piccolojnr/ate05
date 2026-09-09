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
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: /#0001/ }).click();
  await expect(page.getByLabel("Note for Fried Rice")).toHaveValue("No pepper");
  await page.reload();
  await page.getByRole("button", { name: "Orders" }).click();
  await page.getByRole("button", { name: /#0001/ }).click();
  await expect(page.getByLabel("Current order")).toContainText("GHS 100.00");
});

test("renders local seating data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
  await expect(page.getByText("T1")).toBeVisible();
});
