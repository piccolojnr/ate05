import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, cashier = false) {
  await page
    .getByRole("button", { name: cashier ? /Preview Cashier/ : /ATE05 Owner/ })
    .click();
  await page.getByLabel("Staff PIN").fill(cashier ? "1357" : "2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}

test("records, reloads, corrects and filters expenses", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(page.getByText("No expenses yet")).toBeVisible();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Description", { exact: true })).toBeFocused();
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Fresh vegetables");
  await dialog.getByLabel("Amount (GHS)", { exact: true }).fill("123.456");
  await dialog
    .getByRole("button", { name: "Save expense", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("two decimal places");
  await dialog.getByLabel("Amount (GHS)", { exact: true }).fill("123.45");
  await dialog.getByLabel("Expense date", { exact: true }).fill("2026-10-03");
  await dialog
    .getByLabel("Payment method", { exact: true })
    .selectOption("mobile_money");
  await dialog
    .getByRole("button", { name: "Save expense", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Fresh vegetables" });
  await expect(row).toContainText("GHS 123.45");
  await expect(row).toContainText("Mobile money");
  await expect(row).toContainText("3 Oct 2026");

  await page.reload();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await expect(row).toContainText("GHS 123.45");
  await row
    .getByRole("button", { name: "Edit expense: Fresh vegetables" })
    .click();
  await dialog.getByLabel("Amount (GHS)", { exact: true }).fill("150.00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(row).toContainText("GHS 150.00");
  await expect(row).toContainText("Edited");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("Electricity bill");
  await dialog.getByLabel("Amount (GHS)", { exact: true }).fill("80.00");
  await dialog.getByLabel("Expense date", { exact: true }).fill("2026-10-01");
  await dialog
    .getByLabel("Category", { exact: true })
    .selectOption("Utilities");
  await dialog
    .getByLabel("Payment method", { exact: true })
    .selectOption("bank_transfer");
  await dialog
    .getByRole("button", { name: "Save expense", exact: true })
    .click();
  await expect(page.locator("tbody tr").first()).toContainText(
    "Fresh vegetables",
  );
  await page.getByLabel("Filter expense category").selectOption("Utilities");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Electricity bill");
  await page.getByLabel("Search expenses").fill("not recorded");
  await expect(page.getByText("No matching expenses")).toBeVisible();
  await page.getByLabel("Search expenses").fill("");
  await page
    .getByLabel("Filter expense category")
    .selectOption("All categories");
  const notifications = page.getByRole("button", {
    name: "Dismiss notification",
  });
  for (let index = await notifications.count(); index > 0; index--)
    await notifications.first().click();
  await page.getByLabel("Search expenses").blur();
  await page.screenshot({
    path: "/tmp/ate05-expenses-1024.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "/tmp/ate05-expenses-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.screenshot({
    path: "/tmp/ate05-expense-form.png",
    fullPage: true,
  });
});

test("cancelling an entry leaves no expense and Escape closes the dialog", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Description", { exact: true })
    .fill("Unsaved");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("No expenses yet")).toBeVisible();
});

test("cashiers do not see expense navigation", async ({ page }) => {
  await page.goto("/");
  await signIn(page, true);
  await expect(
    page.getByRole("button", { name: "Expenses", exact: true }),
  ).toHaveCount(0);
});
