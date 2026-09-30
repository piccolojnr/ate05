import { expect, test, type Page } from "@playwright/test";
import type { WizardOptions } from "./fixtures/printer-wizard";
import type { PrinterQueue } from "@ate05/printing";

const queues: [PrinterQueue, PrinterQueue] = [
  {
    name: "Generic / Text Only",
    driverName: "Generic / Text Only",
    portName: "USB001",
    status: 0,
    jobs: 0,
  },
  {
    name: "Kitchen Bluetooth — Thermal",
    driverName: "Generic / Text Only",
    portName: "BT001",
    status: 0,
    jobs: 1,
  },
];
const network = {
  id: "existing-network",
  businessId: "business",
  name: "Kitchen LAN",
  role: "kitchen" as const,
  connectionType: "network" as const,
  address: "kitchen.local",
  port: 9200,
  paperWidth: 58 as const,
  cutterEnabled: false,
  active: true,
};

test.use({ viewport: { width: 1024, height: 768 } });

async function mount(page: Page, options: WizardOptions = {}) {
  await page.addInitScript((options) => {
    window.printerWizardOptions = options;
  }, options);
  await page.goto("/e2e/fixtures/printer-wizard.html");
  await expect(page.getByLabel("Printer setup progress")).toBeVisible();
}

async function review(page: Page, role = "Customer receipts") {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: role, exact: false }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Review test" }).click();
}

async function saveAndTest(page: Page) {
  await page.getByRole("button", { name: "Print test page" }).click();
  await expect(
    page.getByRole("button", { name: "Save & finish" }),
  ).toBeEnabled();
}

async function expectFits(page: Page) {
  const bounds = await page
    .getByRole("button", { name: "Continue", exact: true })
    .boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
}

test("network setup retains TCP settings and preview clearly simulates printing", async ({
  page,
}) => {
  await mount(page, { native: false });
  await expect(
    page.getByText(/Browser preview cannot inspect hardware/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Printer installed on this PC" }),
  ).toHaveCount(0);
  await expect(page.getByText(/discovery/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Network printer" }).click();
  await page.getByLabel("Friendly name").fill("Front counter");
  await page.getByLabel("Address or device name").fill("receipt.local");
  await page.getByLabel("Network port").fill("9100");
  await expectFits(page);
  await review(page);
  await expect(page.getByText("receipt.local:9100")).toBeVisible();
  await saveAndTest(page);
  await expect(
    page.getByText(
      "Preview test succeeded. No physical printer was contacted.",
    ),
  ).toBeVisible();
  const result = await page.evaluate(() => window.printerWizardResult);
  expect(result.commands).toEqual([]);
  expect(result.saves[0]).toMatchObject({
    connectionType: "network",
    address: "receipt.local",
    port: 9100,
    queueName: null,
    role: "receipt",
  });
});

test("Windows queues load, refresh, autofill friendly names and save a separate queue name", async ({
  page,
}) => {
  await mount(page, {
    responses: [{ queues, delay: 500 }, { queues: [queues[1]] }],
  });
  await page
    .getByRole("button", { name: "Printer installed on this PC" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Loading printers installed on this PC…",
  );
  await expect(
    page.getByRole("button", { name: "Refresh list" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Installed printer queue")).toBeEnabled();
  await page.getByLabel("Installed printer queue").selectOption(queues[0].name);
  await expect(page.getByLabel("Friendly name")).toHaveValue(queues[0].name);
  await page.getByLabel("Installed printer queue").selectOption(queues[1].name);
  await expect(page.getByLabel("Friendly name")).toHaveValue(queues[1].name);
  await page.getByLabel("Friendly name").fill("Preparation area");
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByLabel("Installed printer queue")).toBeEnabled();
  await page.getByLabel("Installed printer queue").selectOption(queues[1].name);
  await expect(page.getByLabel("Friendly name")).toHaveValue(
    "Preparation area",
  );
  await expect(page.getByLabel("Network port")).toHaveCount(0);
  await expect(page.getByLabel("Address or device name")).toHaveCount(0);
  await expectFits(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Kitchen tickets" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Paper width", { exact: true }).selectOption("58");
  await page.getByLabel("Cutter enabled").uncheck();
  await page.getByRole("button", { name: "Review test" }).click();
  await expect(
    page.getByText(`Windows queue: ${queues[1].name}`),
  ).toBeVisible();
  await saveAndTest(page);
  const result = await page.evaluate(() => window.printerWizardResult);
  expect(result.commands).toEqual([
    "list_printer_queues",
    "list_printer_queues",
  ]);
  expect(result.saves[0]).toMatchObject({
    name: "Preparation area",
    role: "kitchen",
    connectionType: "system",
    queueName: queues[1].name,
    address: "",
    port: null,
    paperWidth: 58,
    cutterEnabled: false,
  });
  expect(result.tests).toEqual(["saved-printer"]);
});

test("empty Windows list gives installation instructions and refresh can recover", async ({
  page,
}) => {
  await mount(page, { responses: [{ queues: [] }, { queues }] });
  await page
    .getByRole("button", { name: "Printer installed on this PC" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No printers installed on this PC were found.",
  );
  await expect(page.getByRole("status")).toContainText(
    "Connect or pair the printer in Windows.",
  );
  await expect(page.getByRole("status")).toContainText(
    "Settings → Bluetooth & devices → Printers & scanners",
  );
  await expect(page.getByRole("status")).toContainText(
    "print a Windows test page",
  );
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await expectFits(page);
  await page.getByRole("button", { name: "Refresh list" }).click();
  await page.getByLabel("Installed printer queue").selectOption(queues[0].name);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
});

test("queue errors and unsupported platforms have explicit recoverable states", async ({
  page,
}) => {
  await mount(page, {
    responses: [
      { error: "spooler_error: Windows Print Spooler is unavailable" },
      {
        error:
          "unsupported_platform: installed printer queues are supported only on Windows",
      },
    ],
  });
  await page
    .getByRole("button", { name: "Printer installed on this PC" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not load the Windows printer list.",
  );
  await expect(page.getByRole("alert")).toContainText("Print Spooler");
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "supported only in the Windows desktop app",
  );
  await expect(page.getByText(/No printers installed/)).toHaveCount(0);
  await expectFits(page);
  await page.getByLabel("Connection", { exact: true }).selectOption("network");
  await expect(page.getByLabel("Network port")).toBeVisible();
});

test("editing a saved network printer preserves its transport and profile", async ({
  page,
}) => {
  await mount(page, { printer: network });
  await expect(page.getByLabel("Connection", { exact: true })).toHaveValue(
    "network",
  );
  await expect(page.getByLabel("Friendly name")).toHaveValue("Kitchen LAN");
  await expect(page.getByLabel("Address or device name")).toHaveValue(
    "kitchen.local",
  );
  await expect(page.getByLabel("Network port")).toHaveValue("9200");
  await review(page, "Kitchen tickets");
  await expect(page.getByText("kitchen.local:9200")).toBeVisible();
  await saveAndTest(page);
  const result = await page.evaluate(() => window.printerWizardResult);
  expect(result.commands).toEqual([]);
  expect(result.saves[0]).toEqual({
    id: network.id,
    name: network.name,
    role: network.role,
    connectionType: "network",
    address: network.address,
    port: network.port,
    queueName: null,
    paperWidth: 58,
    cutterEnabled: false,
    active: true,
  });
});

test("editing an installed queue retains a custom friendly name", async ({
  page,
}) => {
  await mount(page, {
    printer: {
      ...network,
      name: "Custom counter name",
      connectionType: "system",
      queueName: queues[0].name,
      address: "",
      port: null,
    },
    responses: [{ queues }],
  });
  await expect(page.getByLabel("Installed printer queue")).toBeEnabled();
  await expect(page.getByLabel("Installed printer queue")).toHaveValue(
    queues[0].name,
  );
  await page.getByLabel("Installed printer queue").selectOption(queues[1].name);
  await expect(page.getByLabel("Friendly name")).toHaveValue(
    "Custom counter name",
  );
  await review(page, "Kitchen tickets");
  await saveAndTest(page);
  expect(
    (await page.evaluate(() => window.printerWizardResult.saves))[0],
  ).toMatchObject({
    id: network.id,
    name: "Custom counter name",
    connectionType: "system",
    queueName: queues[1].name,
    port: null,
  });
});

test("changing connection explicitly keeps unsaved network address and port", async ({
  page,
}) => {
  await mount(page, { printer: network, responses: [{ queues }] });
  await page.getByLabel("Connection", { exact: true }).selectOption("system");
  await page.getByLabel("Installed printer queue").selectOption(queues[0].name);
  await page.getByLabel("Connection", { exact: true }).selectOption("network");
  await expect(page.getByLabel("Address or device name")).toHaveValue(
    "kitchen.local",
  );
  await expect(page.getByLabel("Network port")).toHaveValue("9200");
});

test("test failures remain actionable and returning to edit resets the test state", async ({
  page,
}) => {
  await mount(page, {
    printer: network,
    testError: "queue_not_found: The printer is unavailable.",
  });
  await review(page, "Kitchen tickets");
  await page.getByRole("button", { name: "Print test page" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The printer is unavailable.",
  );
  await expect(
    page.getByRole("button", { name: "Save & finish" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Review test" }).click();
  await expect(page.getByText("Not tested", { exact: true })).toBeVisible();
});

test("a missing saved Windows queue is retained visibly without silently selecting another printer", async ({
  page,
}) => {
  await mount(page, {
    printer: {
      ...network,
      connectionType: "system",
      queueName: "Removed queue",
      address: "",
      port: null,
    },
    responses: [{ queues }],
  });
  await expect(page.getByRole("alert")).toContainText(
    "The saved queue is not in the current Windows list.",
  );
  await expect(page.getByLabel("Installed printer queue")).toHaveValue(
    "Removed queue",
  );
  await expect(page.getByLabel("Friendly name")).toHaveValue(network.name);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.printerWizardResult.saves)).toEqual(
    [],
  );
});

test("editing after a successful test requires testing the changed configuration again", async ({
  page,
}) => {
  await mount(page, { printer: network });
  await review(page, "Kitchen tickets");
  await saveAndTest(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Paper width", { exact: true }).selectOption("80");
  await page.getByRole("button", { name: "Review test" }).click();
  await expect(
    page.getByRole("button", { name: "Save & finish" }),
  ).toBeDisabled();
  await saveAndTest(page);
  const result = await page.evaluate(() => window.printerWizardResult);
  expect(result.saves).toHaveLength(2);
  expect(result.saves[1]).toMatchObject({ id: network.id, paperWidth: 80 });
});

test("save failures keep the error visible and do not request a test print", async ({
  page,
}) => {
  await mount(page, {
    printer: network,
    saveError: "Printer could not be saved.",
  });
  await review(page, "Kitchen tickets");
  await page.getByRole("button", { name: "Print test page" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Printer could not be saved.",
  );
  await expect(
    page.getByRole("button", { name: "Save & finish" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.printerWizardResult.tests)).toEqual(
    [],
  );
});
