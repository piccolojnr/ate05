import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  const owner = page.getByRole("button", { name: /ATE05 Owner/ });
  if (await owner.count()) await owner.click();
  await page.getByLabel("Staff PIN").fill("2468");
  await page.getByRole("button", { name: /Sign in|Unlock/ }).click();
  await expect(page.getByLabel("Current order")).toBeVisible();
}

test("browser preview explains Google Drive is native-only and offers no fake connection", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Data & backup/ }).click();

  await expect(
    page.getByText(
      /Native Google Drive connection and cloud backup are unavailable in browser preview/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Google Drive" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Recovery Password|Emergency Recovery Key|Cloud Recovery/),
  ).toHaveCount(0);
});
