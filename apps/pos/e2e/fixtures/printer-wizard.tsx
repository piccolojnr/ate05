import { createRoot } from "react-dom/client";
import "../../src/styles.css";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { PrinterQueue } from "@ate05/printing";
import type { PrinterInput } from "../../src/lib/client-capabilities";
import type { PosPrinterConfig } from "../../src/lib/pos-client";
import { PrinterSetupWizard } from "../../src/screens/settings/printer-setup-wizard";
import { validatePrinterInput } from "../../src/lib/printer-configuration";

export interface WizardOptions {
  native?: boolean;
  printer?: PosPrinterConfig;
  responses?: { queues?: PrinterQueue[]; error?: string; delay?: number }[];
  testError?: string;
  saveError?: string;
}

declare global {
  interface Window {
    printerWizardOptions: WizardOptions;
    printerWizardResult: {
      commands: string[];
      saves: PrinterInput[];
      tests: string[];
      closed: boolean;
    };
  }
}

/** Browser-only component harness. Native queue I/O is explicitly mocked. */
export function mountPrinterWizard() {
  const options = window.printerWizardOptions;
  const result = {
    commands: [] as string[],
    saves: [] as PrinterInput[],
    tests: [] as string[],
    closed: false,
  };
  window.printerWizardResult = result;
  let index = 0;
  mockIPC(async (command) => {
    result.commands.push(command);
    if (command !== "list_printer_queues")
      throw new Error(`Unexpected command: ${command}`);
    const responses = options.responses ?? [{ queues: [] }];
    const response = responses[Math.min(index++, responses.length - 1)] ?? {
      queues: [],
    };
    if (response.delay)
      await new Promise((resolve) => setTimeout(resolve, response.delay));
    if (response.error) throw response.error;
    return response.queues ?? [];
  });
  const app = document.getElementById("root");
  if (app) app.style.display = "none";
  const host = document.createElement("div");
  host.style.cssText =
    "width: min(760px, calc(100% - 32px)); margin: 16px auto";
  document.body.append(host);
  createRoot(host).render(
    <PrinterSetupWizard
      printer={options.printer}
      native={options.native ?? true}
      onSave={async (input) => {
        validatePrinterInput(input);
        result.saves.push(input);
        if (options.saveError) throw new Error(options.saveError);
        return {
          ...input,
          id: input.id ?? "saved-printer",
          businessId: "business",
          role: input.role ?? "receipt",
        };
      }}
      onTest={async (id) => {
        result.tests.push(id);
        if (options.testError) throw new Error(options.testError);
      }}
      onClose={() => {
        result.closed = true;
      }}
    />,
  );
}
