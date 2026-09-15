import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  const owner = page.getByRole("button", { name: /ATE05 Owner/ });
  if (await owner.count()) await owner.click();
  const pin = page.getByLabel("Staff PIN");
  if (await pin.count()) {
    await pin.fill("2468");
    await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  }
  await expect(page.getByLabel("Current order")).toBeVisible();
}

test("printer settings offer a guided setup and explicit preview limitation", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /Printers/ }).click();
  await expect(page.getByText("Printers and devices")).toBeVisible();
  await page.screenshot({
    path: "docs/artifacts/settings-printers-empty-1024.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add printer", exact: true })
    .first()
    .click();
  await expect(page.getByText("Printer setup")).toBeVisible();
  await expect(
    page.getByText(/Browser preview cannot inspect hardware/),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "docs/artifacts/settings-printer-discover-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to manual setup" }).click();
  await page.getByLabel("Friendly name").fill("Preview receipt printer");
  await page.getByLabel("Address or device name").fill("preview.local");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Paper width", { exact: true }).selectOption("58");
  await expect(page.getByText("464 dots")).toBeVisible();
  await page.screenshot({
    path: "docs/artifacts/settings-printer-58mm.png",
    fullPage: true,
  });
});
