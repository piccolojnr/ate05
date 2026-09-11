import { Badge, type BadgeProps } from "@ate05/ui";

type StatusKind =
  "order" | "payment" | "kitchen" | "print" | "table" | "inventory";

const statusMap: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
  open: { label: "Open", tone: "neutral" },
  sent_to_kitchen: { label: "Sent to kitchen", tone: "primary" },
  preparing: { label: "Preparing", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  new: { label: "New", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  unpaid: { label: "Unpaid", tone: "warning" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  failed: { label: "Failed", tone: "destructive" },
  printed: { label: "Printed", tone: "success" },
  available: { label: "Available", tone: "success" },
  unavailable: { label: "Unavailable", tone: "warning" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  occupied: { label: "Occupied", tone: "primary" },
  reserved: { label: "Reserved", tone: "warning" },
  low: { label: "Low stock", tone: "warning" },
  low_stock: { label: "Low stock", tone: "warning" },
  out: { label: "Out of stock", tone: "destructive" },
  out_of_stock: { label: "Out of stock", tone: "destructive" },
  in_stock: { label: "In stock", tone: "success" },
};

export function StatusBadge({
  value,
  kind,
}: {
  value: string;
  kind?: StatusKind;
}) {
  const status = statusMap[`${kind ?? "generic"}:${value}`] ??
    statusMap[value] ?? {
      label: value.replaceAll("_", " "),
      tone: "neutral" as const,
    };
  return <Badge tone={status.tone}>{status.label}</Badge>;
}
