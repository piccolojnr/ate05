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

export interface PosClient {
  authBootstrap(): Promise<AuthBootstrap>;
  setupOwnerPin(userId: string, pin: string): Promise<void>;
  authenticateUser(userId: string, pin: string): Promise<SessionUser>;
  currentSession(): Promise<SessionUser | null>;
  lockSession(): Promise<void>;
  listStaff(): Promise<AuthUser[]>;
  createStaff(name: string, role: string, pin: string): Promise<AuthUser>;
  updateStaff(input: {
    userId: string;
    name: string;
    role: string;
    active: boolean;
    pin?: string;
  }): Promise<void>;
  bootstrap(): Promise<PosBootstrap>;
  listMenuManagement(): Promise<MenuManagementData>;
  createMenuItem(input: {
    name: string;
    description?: string | null;
    categoryId: string;
    sellingPriceMinor: number;
    available: boolean;
    active: boolean;
  }): Promise<MenuManagementItem>;
  updateMenuItem(input: {
    id: string;
    name: string;
    description?: string | null;
    categoryId: string;
    sellingPriceMinor: number;
    available: boolean;
    active: boolean;
  }): Promise<MenuManagementItem>;
  createMenuCategory(name: string): Promise<MenuCategory>;
  updateMenuCategory(input: {
    id: string;
    name: string;
    active: boolean;
  }): Promise<MenuCategory>;
  addMenuItem(input: {
    orderId?: string;
    menuItemId: string;
    orderType: OrderType;
    tableId?: string | null;
  }): Promise<PosOrder>;
  createTable(input: {
    name: string;
    capacity?: number;
    active?: boolean;
  }): Promise<RestaurantTable>;
  updateTable(input: {
    id: string;
    name: string;
    capacity?: number;
    active: boolean;
  }): Promise<RestaurantTable>;
  setTableReservationState(
    tableId: string,
    reserved: boolean,
  ): Promise<RestaurantTable>;
  completeOrder(orderId: string): Promise<PosOrder>;
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
  listBackups(): Promise<BackupInfo[]>;
  backupNow(): Promise<BackupInfo>;
  databaseHealth(): Promise<DatabaseHealth>;
  restoreBackup(fileName: string): Promise<BackupInfo>;
  listInventory(): Promise<InventoryItem[]>;
  getInventoryItem(itemId: string): Promise<InventoryItem>;
  listStockMovements(itemId: string): Promise<StockMovement[]>;
  createInventoryItem(input: {
    name: string;
    unit: InventoryUnit;
    startingQuantity: number;
    reorderThreshold: number | null;
  }): Promise<InventoryItem>;
  updateInventoryItem(input: {
    id: string;
    name: string;
    unit: InventoryUnit;
    reorderThreshold: number | null;
    active: boolean;
  }): Promise<InventoryItem>;
  receiveStock(
    itemId: string,
    quantity: number,
    reason?: string,
  ): Promise<InventoryItem>;
  issueStock(
    itemId: string,
    quantity: number,
    reason?: string,
  ): Promise<InventoryItem>;
  recordWaste(
    itemId: string,
    quantity: number,
    reason: string,
  ): Promise<InventoryItem>;
  returnStock(
    itemId: string,
    quantity: number,
    reason?: string,
  ): Promise<InventoryItem>;
  adjustStockToCount(
    itemId: string,
    countedQuantity: number,
    reason: string,
  ): Promise<InventoryItem>;
}

export function formatGhs(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
