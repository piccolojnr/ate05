import type { PaperWidth } from "../index";

export interface KitchenTicketPrintItem {
  itemName: string;
  quantity: number;
  action: "add" | "cancel";
  notes: string | null;
}

export interface KitchenTicketPrintData {
  orderNumber: number;
  tableName: string | null;
  orderType: "dine_in" | "takeaway";
  sequence: number;
  type: "initial" | "addition" | "cancellation";
  createdAt: string;
  items: KitchenTicketPrintItem[];
}

function widthFor(paperWidth: PaperWidth): number {
  return paperWidth === 58 ? 32 : 48;
}

function fit(value: string, width: number): string {
  return value.length > width
    ? `${value.slice(0, Math.max(0, width - 1))}…`
    : value;
}

function line(value: string, width: number): string {
  return fit(value.replace(/\s+/g, " ").trim(), width);
}

function separator(character: string, width: number): string {
  return character.repeat(width);
}

function displayTime(createdAt: string): string {
  return new Date(createdAt).toISOString().slice(11, 16);
}

function title(type: KitchenTicketPrintData["type"]): string {
  return type === "initial"
    ? "INITIAL"
    : type === "addition"
      ? "*** ADDITION ***"
      : "*** CANCELLATION ***";
}

/** Deterministic, price-free kitchen ticket text for preview and ESC/POS encoding. */
export function formatKitchenTicket(
  ticket: KitchenTicketPrintData,
  paperWidth: PaperWidth = 80,
): string {
  const width = widthFor(paperWidth);
  const lines = [
    separator(ticket.type === "cancellation" ? "!" : "=", width),
    "KITCHEN ORDER",
    separator("=", width),
    `ORDER #${String(ticket.orderNumber).padStart(4, "0")}`,
    ticket.tableName ? ticket.tableName.toUpperCase() : "TAKEAWAY",
    displayTime(ticket.createdAt),
    separator("-", width),
    title(ticket.type),
    separator("-", width),
  ];
  for (const item of ticket.items) {
    const prefix = item.action === "cancel" ? "* " : "+ ";
    lines.push(
      line(`${prefix}${item.quantity} x ${item.itemName.toUpperCase()}`, width),
    );
    if (item.notes) lines.push(line(`  ${item.notes}`, width));
    lines.push("");
  }
  lines.push(separator(ticket.type === "cancellation" ? "!" : "=", width));
  lines.push(`TICKET ${ticket.sequence}`);
  lines.push("");
  return lines.map((value) => line(value, width)).join("\n");
}

export function formatPrinterTest(
  createdAt: string,
  paperWidth: PaperWidth = 80,
): string {
  const width = widthFor(paperWidth);
  return [
    separator("=", width),
    "ATE05",
    "KITCHEN PRINTER TEST",
    new Date(createdAt).toISOString(),
    "Printer connection successful.",
    separator("=", width),
    "",
  ]
    .map((value) => line(value, width))
    .join("\n");
}
