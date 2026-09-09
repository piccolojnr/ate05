import type {
  MenuCategory,
  MenuItem,
  PosBootstrap,
  PosClient,
  PosOrder,
  RestaurantTable,
} from "./pos-client";

const storageKey = "ate05-pos-browser-preview-v1";
const businessId = "00000000-0000-4000-8000-000000000001";
const createdBy = "00000000-0000-4000-8000-000000000002";

interface PreviewState {
  nextOrderNumber: number;
  orders: PosOrder[];
}

const categories: MenuCategory[] = [
  { id: "00000000-0000-4000-8000-000000000010", name: "Rice", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000011", name: "Drinks", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000012", name: "Sides", sortOrder: 3 },
];
const items: MenuItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000020",
    categoryId: categories[0]!.id,
    name: "Fried Rice",
    description: null,
    sellingPriceMinor: 5000,
  },
  {
    id: "00000000-0000-4000-8000-000000000021",
    categoryId: categories[0]!.id,
    name: "Jollof Rice",
    description: null,
    sellingPriceMinor: 4500,
  },
  {
    id: "00000000-0000-4000-8000-000000000022",
    categoryId: categories[2]!.id,
    name: "Chicken Wings",
    description: null,
    sellingPriceMinor: 3500,
  },
  {
    id: "00000000-0000-4000-8000-000000000023",
    categoryId: categories[1]!.id,
    name: "Coke",
    description: null,
    sellingPriceMinor: 1200,
  },
];
const tables: RestaurantTable[] = [1, 2, 3, 4].map((number) => ({
  id: `00000000-0000-4000-8000-00000000003${number - 1}`,
  name: `Table ${number}`,
  capacity: 4,
  status: "available",
}));

function readState(): PreviewState {
  const raw = window.localStorage.getItem(storageKey);
  return raw
    ? (JSON.parse(raw) as PreviewState)
    : { nextOrderNumber: 1, orders: [] };
}
function writeState(state: PreviewState): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}
function refreshOrder(order: PosOrder): PosOrder {
  const subtotalMinor = order.items.reduce(
    (total, item) => total + item.lineTotalMinor,
    0,
  );
  return { ...order, subtotalMinor, totalMinor: subtotalMinor };
}

/** Browser-only preview adapter. Desktop uses the explicit Tauri command client. */
export function createBrowserPreviewClient(): PosClient {
  return {
    async bootstrap(): Promise<PosBootstrap> {
      const state = readState();
      const occupied = new Set(
        state.orders
          .filter(
            (order) => order.orderType === "dine_in" && order.status === "open",
          )
          .map((order) => order.tableId),
      );
      return {
        businessId,
        createdBy,
        categories,
        items,
        tables: tables.map((table) => ({
          ...table,
          status: occupied.has(table.id) ? "occupied" : table.status,
        })),
        openOrders: state.orders
          .filter((order) => order.status === "open")
          .map((order) => ({
            id: order.id,
            businessId: order.businessId,
            orderNumber: order.orderNumber,
            orderType: order.orderType,
            tableId: order.tableId,
            tableName: order.tableName,
            status: order.status,
            paymentStatus: order.paymentStatus,
            subtotalMinor: order.subtotalMinor,
            totalMinor: order.totalMinor,
            openedAt: order.openedAt,
          })),
      };
    },
    async addMenuItem(input) {
      const state = readState();
      const menuItem = items.find((item) => item.id === input.menuItemId);
      if (!menuItem) throw new Error("This menu item is unavailable.");
      let order = input.orderId
        ? state.orders.find((entry) => entry.id === input.orderId)
        : undefined;
      if (!order) {
        if (input.orderType === "dine_in" && !input.tableId)
          throw new Error("Select a table for a dine-in order.");
        order = {
          id: crypto.randomUUID(),
          businessId,
          orderNumber: state.nextOrderNumber++,
          orderType: input.orderType,
          tableId:
            input.orderType === "takeaway" ? null : (input.tableId ?? null),
          tableName:
            tables.find((table) => table.id === input.tableId)?.name ?? null,
          status: "open",
          paymentStatus: "unpaid",
          subtotalMinor: 0,
          totalMinor: 0,
          openedAt: new Date().toISOString(),
          items: [],
        };
        state.orders.push(order);
      }
      const existing = order.items.find(
        (item) => item.menuItemId === menuItem.id && !item.notes,
      );
      if (existing) {
        existing.quantity += 1;
        existing.lineTotalMinor = existing.unitPriceMinor * existing.quantity;
      } else
        order.items.push({
          id: crypto.randomUUID(),
          menuItemId: menuItem.id,
          name: menuItem.name,
          unitPriceMinor: menuItem.sellingPriceMinor,
          quantity: 1,
          lineTotalMinor: menuItem.sellingPriceMinor,
          notes: null,
        });
      order = refreshOrder(order);
      state.orders = state.orders.map((entry) =>
        entry.id === order!.id ? order! : entry,
      );
      writeState(state);
      return order;
    },
    async getOrder(orderId) {
      const order = readState().orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found.");
      return order;
    },
    async updateOrderItemQuantity(orderId, itemId, quantity) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order || quantity < 0) throw new Error("Order item is unavailable.");
      order.items =
        quantity === 0
          ? order.items.filter((item) => item.id !== itemId)
          : order.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    quantity,
                    lineTotalMinor: item.unitPriceMinor * quantity,
                  }
                : item,
            );
      const updated = refreshOrder(order);
      state.orders = state.orders.map((entry) =>
        entry.id === orderId ? updated : entry,
      );
      writeState(state);
      return updated;
    },
    async updateOrderItemNote(orderId, itemId, notes) {
      const state = readState();
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order item is unavailable.");
      order.items = order.items.map((item) =>
        item.id === itemId ? { ...item, notes: notes.trim() || null } : item,
      );
      writeState(state);
      return order;
    },
  };
}
