import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  const owner = page.getByRole("button", { name: /ATE05 Owner/ });
  if (await owner.count()) await owner.click();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}

test("cashier selects persisted price options without merging different variants", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.removeItem("ate05-pos-browser-preview-v1"),
  );
  await page.reload();
  await signIn(page);

  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "New Menu Item" }).click();
  await page.getByLabel("Item name").fill("Tilapia");
  await page.getByLabel("Price options").check();
  await page.getByRole("button", { name: "+ Add option" }).click();
  await page.getByLabel("Option 1 name").fill("Small");
  await page.getByLabel("Option 1 price (GHS)").fill("60.00");
  await page.getByRole("button", { name: "+ Add option" }).click();
  await page.getByLabel("Option 2 name").fill("Large");
  await page.getByLabel("Option 2 price (GHS)").fill("110.00");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(
    page.locator("article").filter({ hasText: "Tilapia" }),
  ).toContainText("2 options");

  await page.getByRole("button", { name: "POS", exact: true }).click();
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.getByLabel("Search menu").fill("Tilapia");
  const chooseTilapia = page.getByRole("button", {
    name: "Choose price option for Tilapia",
  });
  await chooseTilapia.click();
  await expect(page.getByRole("dialog")).toContainText("Choose an option");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Current order")).toContainText("No items yet");

  await chooseTilapia.click();
  await page.getByRole("button", { name: /Large.*GHS 110.00/ }).click();
  await chooseTilapia.click();
  await page.getByRole("button", { name: /Large.*GHS 110.00/ }).click();
  await chooseTilapia.click();
  await page.getByRole("button", { name: /Small.*GHS 60.00/ }).click();

  const currentOrder = page.getByLabel("Current order");
  await expect(currentOrder.getByText("Tilapia", { exact: true })).toHaveCount(
    2,
  );
  await expect(currentOrder.getByText("Large", { exact: true })).toBeVisible();
  await expect(currentOrder.getByText("Small", { exact: true })).toBeVisible();
  await expect(currentOrder.getByText("2", { exact: true })).toBeVisible();
  await expect(currentOrder).toContainText("GHS 280.00");

  await page.getByRole("button", { name: "Send to Kitchen" }).click();
  await page.getByRole("button", { name: "Kitchen", exact: true }).click();
  await expect(page.getByText("Tilapia — Large")).toBeVisible();
  await expect(page.getByText("Tilapia — Small")).toBeVisible();

  await page.getByRole("button", { name: "POS", exact: true }).click();
  await page.getByRole("button", { name: "Take Payment" }).click();
  await page.getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.getByLabel("Checkout")).toContainText("Receipt ready");

  const receiptSnapshot = await page.evaluate(() => {
    const raw = localStorage.getItem("ate05-pos-browser-preview-v1");
    const state = JSON.parse(raw ?? "{}") as {
      orders?: Array<{
        receipt?: {
          totalMinor: number;
          items: Array<{
            priceOptionName: string | null;
            unitPriceMinor: number;
            quantity: number;
          }>;
        };
      }>;
    };
    return state.orders?.[0]?.receipt;
  });
  expect(receiptSnapshot).toMatchObject({
    totalMinor: 28000,
    items: expect.arrayContaining([
      expect.objectContaining({
        priceOptionName: "Large",
        unitPriceMinor: 11000,
        quantity: 2,
      }),
      expect.objectContaining({
        priceOptionName: "Small",
        unitPriceMinor: 6000,
        quantity: 1,
      }),
    ]),
  });
  await page.getByRole("button", { name: "Reprint receipt" }).click();
  await expect(page.getByText("Receipt reprinted")).toBeVisible();

  await page.getByRole("button", { name: "Return to order" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Edit Tilapia" }).click();
  await page.getByLabel("Option 2 name").fill("Family");
  await page.getByLabel("Option 2 price (GHS)").fill("125.00");
  await page.getByRole("button", { name: "Save changes" }).click();

  const historical = await page.evaluate(() => {
    const raw = localStorage.getItem("ate05-pos-browser-preview-v1");
    const state = JSON.parse(raw ?? "{}") as {
      orders?: Array<{
        totalMinor: number;
        items: Array<{
          priceOptionName: string | null;
          unitPriceMinor: number;
        }>;
        receipt?: {
          totalMinor: number;
          items: Array<{
            priceOptionName: string | null;
            unitPriceMinor: number;
          }>;
        };
      }>;
    };
    return state.orders?.[0];
  });
  expect(historical).toMatchObject({
    totalMinor: 28000,
    items: expect.arrayContaining([
      expect.objectContaining({
        priceOptionName: "Large",
        unitPriceMinor: 11000,
      }),
    ]),
    receipt: expect.objectContaining({
      totalMinor: 28000,
      items: expect.arrayContaining([
        expect.objectContaining({
          priceOptionName: "Large",
          unitPriceMinor: 11000,
        }),
      ]),
    }),
  });
});
