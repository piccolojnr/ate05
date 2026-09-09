import { expect, test } from "@playwright/test";

test("renders the POS order entry screen and placeholder navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Current order")).toBeVisible();
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: "Tables" }).click();
  await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
});
