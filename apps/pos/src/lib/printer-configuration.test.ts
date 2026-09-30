import { describe, expect, it } from "vitest";
import {
  nativePrinterRequest,
  validatePrinterInput,
} from "./printer-configuration";
import type { PosPrinterConfig } from "./pos-client";

const printer: PosPrinterConfig = {
  id: "receipt",
  businessId: "business",
  name: "Front counter",
  role: "receipt",
  connectionType: "system",
  address: "",
  queueName: "Generic / Text Only — USB",
  port: null,
  paperWidth: 58,
  cutterEnabled: false,
  active: true,
};

describe("printer configuration contracts", () => {
  it("validates and serializes the exact Windows queue separately from TCP fields", () => {
    expect(() => validatePrinterInput(printer)).not.toThrow();
    expect(nativePrinterRequest(printer)).toEqual({
      connectionType: "system",
      address: "",
      queueName: printer.queueName,
      port: null,
      paperWidth: 58,
      cutterEnabled: false,
    });
  });

  it("rejects missing queues, embedded NULs, and TCP fields for installed queues", () => {
    for (const change of [
      { queueName: null },
      { queueName: " " },
      { queueName: "Bad\0queue" },
      { address: "USB001" },
      { port: 9100 },
    ])
      expect(() => validatePrinterInput({ ...printer, ...change })).toThrow(
        "Select an installed printer queue",
      );
  });

  it("keeps network addresses and ports unchanged and does not serialize stale queue names", () => {
    const network = {
      ...printer,
      connectionType: "network" as const,
      address: "printer.local",
      port: 9200,
    };
    expect(() => validatePrinterInput(network)).not.toThrow();
    expect(nativePrinterRequest(network)).toMatchObject({
      connectionType: "network",
      address: "printer.local",
      port: 9200,
      queueName: null,
    });
    for (const port of [null, 0, 65536, 9100.5])
      expect(() => validatePrinterInput({ ...network, port })).toThrow(
        "valid port",
      );
  });
});
