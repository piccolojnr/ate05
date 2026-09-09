export type OrderType = "dine_in" | "takeaway";

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
  openedAt: string;
  items: OrderItem[];
}

export type OpenOrder = Omit<PosOrder, "items">;

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
}

export function formatGhs(minor: number): string {
  return `GHS ${(minor / 100).toFixed(2)}`;
}
