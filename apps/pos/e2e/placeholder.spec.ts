import { expect, test } from "@playwright/test";

test("renders the POS placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ATE05 POS" })).toBeVisible();
  await expect(page.getByText("The application is running.")).toBeVisible();
});
