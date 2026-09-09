export type OrderType = "dine_in" | "takeaway";
import type { PrinterConfig, PaperWidth } from "@ate05/printing";

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  sellingPriceMinor: number;
}

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: "available" | "occupied" | "reserved";
}

export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  notes: string | null;
}

export interface PosOrder {
  id: string;
  businessId: string;
  orderNumber: number;
  orderType: OrderType;
  tableId: string | null;
  tableName: string | null;
  status: string;
  paymentStatus: string;
  subtotalMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  receipt: PosReceipt | null;
  openedAt: string;
  items: OrderItem[];
  kitchenTickets: KitchenTicket[];
  kitchenChangesPending: boolean;
}

export type PaymentMethod = "cash" | "mobile_money" | "card" | "other";
export interface PosPayment {
  id: string;
  amountMinor: number;
  method: PaymentMethod;
  reference: string | null;
  cashTenderedMinor: number | null;
  changeMinor: number | null;
}
export interface PosReceipt {
  id: string;
  receiptNumber: number;
  totalMinor: number;
  issuedAt: string;
  printStatus: "pending" | "printed" | "failed";
  printedAt: string | null;
  lastPrintError: string | null;
  payments: PosPayment[];
  items: OrderItem[];
}

export type OpenOrder = Omit<
  PosOrder,
  "items" | "kitchenTickets" | "kitchenChangesPending"
>;

export interface KitchenTicketItem {
  id: string;
  orderItemId: string | null;
  itemName: string;
  quantity: number;
  action: "add" | "cancel";
  notes: string | null;
}

export interface KitchenTicket {
  id: string;
  sequence: number;
  type: "initial" | "addition" | "cancellation";
  printStatus: "pending" | "printed" | "failed";
  printedAt: string | null;
  createdAt: string;
  lastPrintError: string | null;
  printAttemptCount: number;
  lastAttemptAt: string | null;
  items: KitchenTicketItem[];
}

export type PosPrinterConfig = PrinterConfig;

export interface PosBootstrap {
  businessId: string;
  createdBy: string;
  categories: MenuCategory[];
  items: MenuItem[];
  tables: RestaurantTable[];
  openOrders: OpenOrder[];
}

export interface PosClient {
  bootstrap(): Promise<PosBootstrap>;
  addMenuItem(input: {
    orderId?: string;
    menuItemId: string;
    orderType: OrderType;
    tableId?: string | null;
  }): Promise<PosOrder>;
  getOrder(orderId: string): Promise<PosOrder>;
  updateOrderItemQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<PosOrder>;
  updateOrderItemNote(
    orderId: string,
    itemId: string,
    notes: string,
  ): Promise<PosOrder>;
  removeOrderItem(orderId: string, itemId: string): Promise<PosOrder>;
  sendOrderToKitchen(orderId: string): Promise<PosOrder>;
  listPrinters(): Promise<PosPrinterConfig[]>;
  savePrinter(input: {
    id?: string;
    role?: "kitchen" | "receipt";
    name: string;
    connectionType: "network" | "usb";
    address: string;
    port: number | null;
    paperWidth: PaperWidth;
    cutterEnabled: boolean;
    active: boolean;
  }): Promise<PosPrinterConfig>;
  testPrinter(printerId: string): Promise<void>;
  retryPendingKitchenPrints(): Promise<PosOrder[]>;
  reprintKitchenTicket(orderId: string, ticketId: string): Promise<void>;
  recordPayment(input: {
    orderId: string;
    method: PaymentMethod;
    amountMinor: number;
    cashTenderedMinor?: number | null;
    reference?: string | null;
    idempotencyKey: string;
  }): Promise<PosOrder>;
  listReceipts(): Promise<PosReceipt[]>;
  retryPendingReceiptPrints(): Promise<PosOrder[]>;
  reprintReceipt(orderId: string): Promise<void>;
}

export function formatGhs(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
