import type { PaperWidth } from "../index";

export interface ReceiptPrintItem {
  name: string;
  priceOptionName?: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface ReceiptPayment {
  method: string;
  amountMinor: number;
}

export interface ReceiptPrintData {
  businessName: string;
  receiptNumber: number;
  orderNumber: number;
  issuedAt: string;
  tableName: string | null;
  items: ReceiptPrintItem[];
  subtotalMinor: number;
  totalMinor: number;
  payments: ReceiptPayment[];
}

function widthFor(paperWidth: PaperWidth): number {
  return paperWidth === 58 ? 32 : 48;
}
function fit(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value;
}
function money(minor: number): string {
  return "GHS " + (minor / 100).toFixed(2);
}
function row(label: string, value: string, width: number): string {
  const left = fit(label, Math.max(1, width - value.length - 1));
  return (
    left + " ".repeat(Math.max(1, width - left.length - value.length)) + value
  );
}
function method(value: string): string {
  return value === "mobile_money"
    ? "Mobile Money"
    : value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatReceipt(
  receipt: ReceiptPrintData,
  paperWidth: PaperWidth = 80,
): string {
  const width = widthFor(paperWidth);
  const separator = "-".repeat(width);
  const lines = [
    receipt.businessName,
    "CUSTOMER RECEIPT",
    separator,
    row("Receipt #", String(receipt.receiptNumber).padStart(6, "0"), width),
    row("Order #", String(receipt.orderNumber).padStart(4, "0"), width),
    row(
      "Date",
      new Date(receipt.issuedAt).toISOString().slice(0, 16).replace("T", " "),
      width,
    ),
    row("Table", receipt.tableName ?? "TAKEAWAY", width),
    separator,
  ];
  for (const item of receipt.items) {
    const name = item.priceOptionName
      ? `${item.name} — ${item.priceOptionName}`
      : item.name;
    lines.push(fit(item.quantity + " x " + name, width));
    lines.push(row("", money(item.lineTotalMinor), width));
  }
  lines.push(
    separator,
    row("Subtotal", money(receipt.subtotalMinor), width),
    row("Total", money(receipt.totalMinor), width),
    "",
    "PAYMENTS",
  );
  for (const payment of receipt.payments)
    lines.push(row(method(payment.method), money(payment.amountMinor), width));
  lines.push(
    row("Total Paid", money(receipt.totalMinor), width),
    "",
    "PAID",
    "Thank you",
    "",
  );
  return lines.map((line) => fit(line, width)).join("\n");
}
