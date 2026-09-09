import { describe, expect, it } from "vitest";
import {
  createPreviewPrinter,
  encodeEscPos,
  formatKitchenTicket,
  formatPrinterTest,
} from ".";

const ticket = {
  orderNumber: 142,
  tableName: "Table 4",
  orderType: "dine_in" as const,
  sequence: 1,
  type: "initial" as const,
  createdAt: "2026-09-09T20:15:00.000Z",
  items: [
    {
      itemName: "Fried Rice",
      quantity: 2,
      action: "add" as const,
      notes: "No pepper",
    },
    {
      itemName: "Jollof Rice",
      quantity: 1,
      action: "add" as const,
      notes: null,
    },
  ],
};

describe("kitchen ticket printing", () => {
  it("formats initial, addition, and cancellation tickets without prices", () => {
    expect(formatKitchenTicket(ticket)).toContain("INITIAL");
    expect(formatKitchenTicket({ ...ticket, type: "addition" })).toContain(
      "*** ADDITION ***",
    );
    expect(formatKitchenTicket({ ...ticket, type: "cancellation" })).toContain(
      "*** CANCELLATION ***",
    );
    expect(formatKitchenTicket(ticket)).not.toContain("GHS");
  });

  it("keeps lines within the configured 58mm and 80mm widths", () => {
    for (const width of [58, 80] as const) {
      expect(
        formatKitchenTicket(
          {
            ...ticket,
            items: [
              {
                ...ticket.items[0]!,
                itemName: "A very long kitchen item name that must be clipped",
              },
            ],
          },
          width,
        )
          .split("\n")
          .every((line) => line.length <= (width === 58 ? 32 : 48)),
      ).toBe(true);
    }
  });

  it("encodes initialization, emphasis, feed, and optional cut commands", () => {
    const encoded = encodeEscPos(formatKitchenTicket(ticket));
    expect(Array.from(encoded.slice(0, 3))).toEqual([0x1b, 0x40, 0x1b]);
    expect(encoded).toContain(0x45);
    expect(encoded.slice(-3)).toEqual(Uint8Array.from([0x1d, 0x56, 0x00]));
    expect(
      encodeEscPos(formatPrinterTest(ticket.createdAt), false).at(-1),
    ).not.toBe(0x00);
  });

  it("keeps browser preview transport separate from hardware", async () => {
    const printer = createPreviewPrinter();
    const result = await printer.print({
      id: "ticket-1",
      document: {
        id: "ticket-1",
        kind: "kitchen-ticket",
        content: formatKitchenTicket(ticket),
      },
      printer: {
        id: "preview-printer",
        businessId: "business",
        name: "Preview",
        role: "kitchen",
        connectionType: "network",
        address: "127.0.0.1",
        port: 9100,
        paperWidth: 80,
        cutterEnabled: true,
        active: true,
      },
    });
    expect(result.message).toContain("no hardware");
    expect(printer.jobs).toHaveLength(1);
  });
});
