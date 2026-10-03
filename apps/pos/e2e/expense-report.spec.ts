import { expect, test, type Page } from "@playwright/test";

async function openExpenses(page: Page, failRead = false) {
  await page.clock.setFixedTime(new Date("2026-10-03T12:00:00Z"));
  await page.goto("/");
  await page.evaluate((fail) => {
    const key = "ate05-pos-browser-preview-v1";
    const state = {
      nextOrderNumber: 1,
      nextReceiptNumber: 1,
      orders: [],
      printers: [],
      inventory: [],
      movements: [],
      expenses: [
        ["2026-09-27", 90000, "Rent", "Previous week"],
        ["2026-09-28", 3000, "Ingredients", "Monday produce"],
        ["2026-10-03", 12345, "Ingredients", "Fresh vegetables"],
        ["2026-10-04", 8000, "Utilities", "Electricity bill"],
        ["2026-10-31", 1000, "Transport", "Delivery"],
        ["2026-11-01", 70000, "Rent", "Next month"],
      ].map(([expenseDate, amountMinor, category, description], index) => ({
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        businessId: "00000000-0000-4000-8000-000000000001",
        createdBy: "00000000-0000-4000-8000-000000000002",
        updatedBy: "00000000-0000-4000-8000-000000000002",
        createdAt: "2026-10-03T12:00:00Z",
        updatedAt: "2026-10-03T12:00:00Z",
        version: 1,
        paymentMethod: "cash",
        expenseDate,
        amountMinor,
        category,
        description,
      })),
    };
    localStorage.setItem(key, JSON.stringify(state));
    if (fail) {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (name) {
        if (name === key) throw new Error("Expense storage is unavailable.");
        return original.call(this, name);
      };
    }
  }, failRead);
  await page.getByRole("button", { name: /ATE05 Owner/ }).click();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await page.getByRole("tab", { name: "Expense report", exact: true }).click();
  return page.getByRole("region", { name: "Expense report", exact: true });
}

test("reports total expenses and categories for inclusive daily, weekly, monthly and custom ranges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const report = await openExpenses(page);
  const total = report.getByTestId("expense-report-total");
  await expect(report.getByLabel("Report date range")).toHaveText(
    "1 Oct 2026 – 31 Oct 2026",
  );
  await expect(total).toHaveText("GHS 213.45");
  await expect(report.getByLabel("Expense summary")).toContainText(
    "3 expenses recorded",
  );
  await expect(
    report.getByRole("row").filter({ hasText: "Ingredients" }),
  ).toContainText("GHS 123.45");

  await report.getByLabel("Report period").selectOption("today");
  await expect(total).toHaveText("GHS 123.45");
  await expect(report.getByLabel("Report date range")).toHaveText("3 Oct 2026");
  await report.getByLabel("Report period").selectOption("week");
  await expect(report.getByLabel("Report date range")).toHaveText(
    "28 Sept 2026 – 4 Oct 2026 · Monday to Sunday",
  );
  await expect(total).toHaveText("GHS 233.45");
  await expect(
    report.getByRole("row").filter({ hasText: "Ingredients" }),
  ).toContainText("GHS 153.45");

  await report.getByLabel("Report period").selectOption("custom");
  await report.getByLabel("Report start date").fill("2026-10-04");
  await report.getByLabel("Report end date").fill("2026-10-31");
  await expect(total).toHaveText("GHS 90.00");
  await report.getByLabel("Report start date").fill("2026-11-02");
  await expect(report.getByRole("alert")).toContainText(
    "Start date must be on or before end date",
  );
  await expect(total).toHaveCount(0);
  await report.getByLabel("Report end date").fill("2026-11-03");
  await expect(total).toHaveText("GHS 0.00");
  await expect(report.getByText("No expenses in this period")).toBeVisible();

  await report.getByLabel("Report period").selectOption("week");
  await page.screenshot({
    path: "/tmp/ate05-expense-report-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: "/tmp/ate05-expense-report-1024.png",
    fullPage: true,
  });
});

test("records search does not alter report totals, and corrections update the report", async ({
  page,
}) => {
  const report = await openExpenses(page);
  await expect(report.getByTestId("expense-report-total")).toHaveText(
    "GHS 213.45",
  );
  await page.getByRole("tab", { name: "Records", exact: true }).click();
  await page.getByLabel("Search expenses").fill("Fresh vegetables");
  await page
    .getByRole("button", {
      name: "Edit expense: Fresh vegetables",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (GHS)", { exact: true }).fill("150.00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("tab", { name: "Expense report", exact: true }).click();
  await expect(report.getByTestId("expense-report-total")).toHaveText(
    "GHS 240.00",
  );
  await report
    .getByRole("button", { name: "Refresh report", exact: true })
    .click();
  await expect(report.getByTestId("expense-report-total")).toHaveText(
    "GHS 240.00",
  );
});

test("does not present a failed read as a zero-spending report", async ({
  page,
}) => {
  const report = await openExpenses(page, true);
  await expect(report.getByRole("alert")).toContainText(
    "Expense storage is unavailable",
  );
  await expect(report.getByTestId("expense-report-total")).toHaveCount(0);
  await expect(report.getByText("No expenses in this period")).toHaveCount(0);
});

test("expense view tabs support keyboard navigation", async ({ page }) => {
  await openExpenses(page);
  const reportTab = page.getByRole("tab", {
    name: "Expense report",
    exact: true,
  });
  await reportTab.focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Records", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(reportTab).toBeFocused();
  await expect(reportTab).toHaveAttribute("aria-selected", "true");
});
