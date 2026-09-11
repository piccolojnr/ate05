import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  const owner = page.getByRole("button", { name: /ATE05 Owner/ });
  if (await owner.count()) await owner.click();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}

test("kitchen board advances a persisted ticket through its stages", async ({
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
  await page.getByRole("button", { name: "Send to Kitchen" }).click();
  await page.getByRole("button", { name: "Kitchen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  await expect(page.getByText("#0001")).toBeVisible();
  await page.screenshot({
    path: "docs/artifacts/kitchen-board-1024.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Start preparing" }).click();
  await expect(page.getByText("Preparing").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Ready").first()).toBeVisible();
  await expect(page.getByText("Payment")).not.toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "docs/artifacts/kitchen-board-1440.png",
    fullPage: true,
  });
});
