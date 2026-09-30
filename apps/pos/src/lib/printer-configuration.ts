import type { PrinterInput } from "./client-capabilities";
import type { PosPrinterConfig } from "./pos-client";
import { PosClientError } from "./client-errors";

export function validatePrinterInput(input: PrinterInput): void {
  if (!["network", "usb", "system"].includes(input.connectionType))
    throw new PosClientError(
      "validation",
      "Choose a supported printer connection.",
    );
  if (!input.name.trim())
    throw new PosClientError(
      "validation",
      "Give this printer a friendly name.",
    );
  if (input.connectionType === "system") {
    if (
      !input.queueName?.trim() ||
      input.queueName.includes("\0") ||
      input.queueName.length > 1024 ||
      input.address !== "" ||
      input.port !== null
    )
      throw new PosClientError(
        "validation",
        "Select an installed printer queue; system printers do not use an address or port.",
      );
  } else if (!input.address.trim()) {
    throw new PosClientError(
      "validation",
      "Printer name and address are required.",
    );
  }
  if (
    input.connectionType === "network" &&
    (!input.port ||
      !Number.isInteger(input.port) ||
      input.port < 1 ||
      input.port > 65535)
  )
    throw new PosClientError(
      "validation",
      "A network printer needs a valid port.",
    );
  if (input.paperWidth !== 58 && input.paperWidth !== 80)
    throw new PosClientError("validation", "Paper width must be 58mm or 80mm.");
}

/** Keep the exact queue name separate from TCP address and port. */
export function nativePrinterRequest(printer: PosPrinterConfig) {
  return {
    connectionType: printer.connectionType,
    address: printer.address,
    queueName:
      printer.connectionType === "system" ? (printer.queueName ?? null) : null,
    port: printer.port,
    paperWidth: printer.paperWidth,
    cutterEnabled: printer.cutterEnabled,
  };
}
