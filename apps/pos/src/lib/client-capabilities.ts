import type { PaperWidth } from "@ate05/printing";
import type {
  AuthBootstrap,
  AuthUser,
  BackupInfo,
  DatabaseHealth,
  InventoryItem,
  InventoryUnit,
  MenuCategory,
  MenuManagementData,
  MenuManagementItem,
  OrderType,
  PosBootstrap,
  PosOrder,
  PosPayment,
  PosPrinterConfig,
  PosReceipt,
  RestaurantTable,
  SessionUser,
  StockMovement,
} from "./pos-client";

export interface SetupProgressInput {
  step: number;
  businessName: string;
  ownerName: string;
  starterPack: string;
  tableCount: number;
}

export interface FirstRunSetupInput {
  businessName: string;
  ownerUserId: string;
  ownerName: string;
  ownerPin: string;
  starterPack: "empty" | "ghanaian" | "fast_food" | "drinks_snacks";
  tableCount: number;
}

export interface StaffUpdateInput {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  pin?: string;
}

export interface CatalogItemInput {
  name: string;
  description?: string | null;
  categoryId: string;
  sellingPriceMinor: number;
  available: boolean;
  active: boolean;
}

export interface PrinterInput {
  id?: string;
  role?: "kitchen" | "receipt";
  name: string;
  connectionType: "network" | "usb";
  address: string;
  port: number | null;
  paperWidth: PaperWidth;
  cutterEnabled: boolean;
  active: boolean;
}

export interface InventoryItemInput {
  name: string;
  unit: InventoryUnit;
  startingQuantity: number;
  reorderThreshold: number | null;
}

export interface InventoryUpdateInput {
  id: string;
  name: string;
  unit: InventoryUnit;
  reorderThreshold: number | null;
  active: boolean;
}

export interface SessionClient {
  authBootstrap(): Promise<AuthBootstrap>;
  setupOwnerPin(userId: string, pin: string): Promise<void>;
  saveSetupProgress(input: SetupProgressInput): Promise<void>;
  completeFirstRunSetup(input: FirstRunSetupInput): Promise<void>;
  authenticateUser(userId: string, pin: string): Promise<SessionUser>;
  currentSession(): Promise<SessionUser | null>;
  lockSession(): Promise<void>;
  getRememberedStaffId(): Promise<string | null>;
  rememberStaff(userId: string): Promise<void>;
  forgetRememberedStaff(): Promise<void>;
  listStaff(): Promise<AuthUser[]>;
  createStaff(name: string, role: string, pin: string): Promise<AuthUser>;
  updateStaff(input: StaffUpdateInput): Promise<void>;
}

export interface BootstrapClient {
  bootstrap(): Promise<PosBootstrap>;
}

export interface CatalogClient {
  listMenuManagement(): Promise<MenuManagementData>;
  createMenuItem(input: CatalogItemInput): Promise<MenuManagementItem>;
  updateMenuItem(
    input: CatalogItemInput & { id: string },
  ): Promise<MenuManagementItem>;
  createMenuCategory(name: string): Promise<MenuCategory>;
  updateMenuCategory(input: {
    id: string;
    name: string;
    active: boolean;
  }): Promise<MenuCategory>;
}

export interface OrdersClient {
  addMenuItem(input: {
    orderId?: string;
    menuItemId: string;
    orderType: OrderType;
    tableId?: string | null;
  }): Promise<PosOrder>;
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
}

export interface PaymentsClient {
  recordPayment(input: {
    orderId: string;
    method: PosPayment["method"];
    amountMinor: number;
    cashTenderedMinor?: number | null;
    reference?: string | null;
    idempotencyKey: string;
  }): Promise<PosOrder>;
  listReceipts(): Promise<PosReceipt[]>;
}

export interface KitchenClient {
  sendOrderToKitchen(orderId: string): Promise<PosOrder>;
  retryPendingKitchenPrints(): Promise<PosOrder[]>;
  reprintKitchenTicket(orderId: string, ticketId: string): Promise<void>;
}

export interface TablesClient {
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
}

export interface InventoryClient {
  listInventory(): Promise<InventoryItem[]>;
  getInventoryItem(itemId: string): Promise<InventoryItem>;
  listStockMovements(itemId: string): Promise<StockMovement[]>;
  createInventoryItem(input: InventoryItemInput): Promise<InventoryItem>;
  updateInventoryItem(input: InventoryUpdateInput): Promise<InventoryItem>;
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

export interface PrintingClient {
  listPrinters(): Promise<PosPrinterConfig[]>;
  savePrinter(input: PrinterInput): Promise<PosPrinterConfig>;
  testPrinter(printerId: string): Promise<void>;
  retryReceiptPrint(orderId: string): Promise<void>;
  retryPendingReceiptPrints(): Promise<PosOrder[]>;
  reprintReceipt(orderId: string): Promise<void>;
}

export interface SettingsClient {
  /** Marker for the future standalone settings capability. */
  readonly __settingsClient?: never;
}

export interface RecoveryClient {
  listBackups(): Promise<BackupInfo[]>;
  backupNow(): Promise<BackupInfo>;
  exportBackup(): Promise<string | null>;
  databaseHealth(): Promise<DatabaseHealth>;
  restoreBackup(fileName: string): Promise<BackupInfo>;
}
