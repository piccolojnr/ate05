import type { KitchenTicketType } from "./index";

export type KitchenAction = "add" | "cancel";

export interface KitchenSyncLine {
  orderItemId: string;
  itemName: string;
  quantity: number;
  notes: string | null;
  sentQuantity: number;
  sentNotes: string | null;
}

export interface KitchenDeltaLine {
  orderItemId: string;
  itemName: string;
  quantity: number;
  action: KitchenAction;
  notes: string | null;
}

export interface KitchenDelta {
  type: KitchenTicketType;
  items: KitchenDeltaLine[];
}

/**
 * Calculates instructions needed to reconcile the current order with the
 * immutable instructions already sent to the kitchen.
 *
 * A material note change is represented as a cancellation of the previous
 * sent quantity followed by an addition of the current quantity. This keeps
 * the V1 ticket vocabulary small while making the correction explicit.
 */
export function calculateKitchenDeltas(
  lines: KitchenSyncLine[],
  hasPriorTickets: boolean,
): KitchenDelta[] {
  if (!hasPriorTickets) {
    const items = lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        orderItemId: line.orderItemId,
        itemName: line.itemName,
        quantity: line.quantity,
        action: "add" as const,
        notes: line.notes,
      }));
    return items.length > 0 ? [{ type: "initial", items }] : [];
  }

  const cancellations: KitchenDeltaLine[] = [];
  const additions: KitchenDeltaLine[] = [];
  for (const line of lines) {
    const sentQuantity = Math.max(0, line.sentQuantity);
    const noteChanged =
      sentQuantity > 0 && line.quantity > 0 && line.notes !== line.sentNotes;

    if (noteChanged) {
      cancellations.push({
        orderItemId: line.orderItemId,
        itemName: line.itemName,
        quantity: sentQuantity,
        action: "cancel",
        notes: line.sentNotes,
      });
      additions.push({
        orderItemId: line.orderItemId,
        itemName: line.itemName,
        quantity: line.quantity,
        action: "add",
        notes: line.notes,
      });
      continue;
    }

    if (line.quantity > sentQuantity) {
      additions.push({
        orderItemId: line.orderItemId,
        itemName: line.itemName,
        quantity: line.quantity - sentQuantity,
        action: "add",
        notes: line.notes,
      });
    } else if (line.quantity < sentQuantity) {
      cancellations.push({
        orderItemId: line.orderItemId,
        itemName: line.itemName,
        quantity: sentQuantity - line.quantity,
        action: "cancel",
        notes: line.sentNotes ?? line.notes,
      });
    }
  }

  return [
    ...(cancellations.length > 0
      ? [{ type: "cancellation" as const, items: cancellations }]
      : []),
    ...(additions.length > 0
      ? [{ type: "addition" as const, items: additions }]
      : []),
  ];
}
