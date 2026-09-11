import { expect, test } from "@playwright/test";

test("preview starts locked, rejects an incorrect PIN, and allows user switching", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
  await page.getByLabel("Staff PIN").fill("0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect PIN");
  await page.getByLabel("Staff PIN").fill("1357");
  await page
    .getByRole("combobox", { name: "Staff member" })
    .selectOption("preview-cashier");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
});
