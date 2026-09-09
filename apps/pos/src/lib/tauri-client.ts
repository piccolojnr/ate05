import { invoke } from "@tauri-apps/api/core";
import type { PosBootstrap, PosClient, PosOrder } from "./pos-client";

/** Production desktop adapter: persistence is owned by explicit Tauri commands. */
export function createTauriClient(): PosClient {
  return {
    bootstrap: () => invoke<PosBootstrap>("pos_bootstrap"),
    addMenuItem: (input) => invoke<PosOrder>("pos_add_menu_item", { input }),
    getOrder: (orderId) => invoke<PosOrder>("pos_get_order", { orderId }),
    updateOrderItemQuantity: (orderId, itemId, quantity) =>
      invoke<PosOrder>("pos_update_order_item_quantity", {
        orderId,
        itemId,
        quantity,
      }),
    updateOrderItemNote: (orderId, itemId, notes) =>
      invoke<PosOrder>("pos_update_order_item_note", {
        orderId,
        itemId,
        notes,
      }),
  };
}
