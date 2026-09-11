export type OrderType = "dine_in" | "takeaway";
import type { PrinterConfig } from "@ate05/printing";
import type {
  BootstrapClient,
  CatalogClient,
  InventoryClient,
  KitchenClient,
  OrdersClient,
  PaymentsClient,
  PrintingClient,
  RecoveryClient,
  SessionClient,
  SettingsClient,
  TablesClient,
} from "./client-capabilities";

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

export interface MenuManagementItem extends MenuItem {
  categoryName: string;
  available: boolean;
  active: boolean;
  updatedAt: string;
}

export interface MenuManagementData {
  categories: Array<MenuCategory & { active: boolean }>;
  items: MenuManagementItem[];
}

export type InventoryUnit =
  "kg" | "g" | "litre" | "ml" | "bottle" | "piece" | "pack";
export type StockMovementType =
  "purchase" | "kitchen_issue" | "waste" | "return" | "adjustment";
export interface InventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  currentQuantity: number;
  reorderThreshold: number | null;
  active: boolean;
  stockState: "in_stock" | "low_stock" | "out_of_stock";
}
export interface StockMovement {
  id: string;
  inventoryItemId: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  active: boolean;
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

export interface BackupInfo {
  fileName: string;
  kind: "automatic" | "manual" | "pre_restore";
  createdAt: number;
  schemaVersion: number;
  sizeBytes: number;
  valid: boolean;
}

export interface DatabaseHealth {
  healthy: boolean;
  schemaVersion: number;
  message: string;
}

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
  hasPin: boolean;
}

export interface AuthBootstrap {
  users: AuthUser[];
  requiresOwnerPin: boolean;
  setupRequired: boolean;
  businessName: string;
  setupStep: number;
  setupBusinessName: string | null;
  setupOwnerName: string | null;
  setupStarterPack: string | null;
  setupTableCount: number | null;
}

export interface SessionUser {
  id: string;
  businessId: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface PosBootstrap {
  businessId: string;
  createdBy: string;
  categories: MenuCategory[];
  items: MenuItem[];
  tables: RestaurantTable[];
  openOrders: OpenOrder[];
  inventory: InventoryItem[];
}

export interface PosClient
  extends
    SessionClient,
    BootstrapClient,
    CatalogClient,
    OrdersClient,
    PaymentsClient,
    KitchenClient,
    TablesClient,
    InventoryClient,
    PrintingClient,
    SettingsClient,
    RecoveryClient {}

export function formatGhs(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
