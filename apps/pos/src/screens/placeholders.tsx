import { Badge, Button, Card } from "@ate05/ui";

function ScreenHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-primary">ATE05 Operations</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <Button>{action}</Button> : null}
    </header>
  );
}

const statuses = [
  {
    id: "#A-1042",
    guest: "Table 06 · 2 guests",
    status: "Preparing",
    tone: "warning" as const,
    total: "GHS 172.00",
  },
  {
    id: "#A-1041",
    guest: "Takeaway · Ama K.",
    status: "Ready",
    tone: "success" as const,
    total: "GHS 55.00",
  },
  {
    id: "#A-1040",
    guest: "Table 02 · 4 guests",
    status: "Completed",
    tone: "neutral" as const,
    total: "GHS 231.00",
  },
  {
    id: "#A-1039",
    guest: "Table 09 · 3 guests",
    status: "Paid",
    tone: "primary" as const,
    total: "GHS 106.00",
  },
  {
    id: "#A-1038",
    guest: "Walk-in · Joseph A.",
    status: "Unpaid",
    tone: "destructive" as const,
    total: "GHS 84.00",
  },
];

export function OrdersScreen() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Orders"
        description="Track open and completed orders across the restaurant."
        action="New order"
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Order</span>
          <span>Guest</span>
          <span>Status</span>
          <span className="text-right">Total</span>
        </div>
        {statuses.map((order) => (
          <button
            type="button"
            key={order.id}
            className="grid w-full grid-cols-[1fr_1.5fr_1fr_1fr] gap-4 border-b px-5 py-4 text-left transition-colors last:border-0 hover:bg-muted/40"
          >
            <span className="font-black">{order.id}</span>
            <span className="text-sm text-muted-foreground">{order.guest}</span>
            <span>
              <Badge tone={order.tone}>{order.status}</Badge>
            </span>
            <span className="text-right font-bold">{order.total}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

const tables = [
  { name: "T01", state: "Available", tone: "success" as const },
  { name: "T02", state: "Occupied", tone: "destructive" as const },
  { name: "T03", state: "Reserved", tone: "warning" as const },
  { name: "T04", state: "Available", tone: "success" as const },
  { name: "T05", state: "Occupied", tone: "destructive" as const },
  { name: "T06", state: "Occupied", tone: "destructive" as const },
  { name: "T07", state: "Available", tone: "success" as const },
  { name: "T08", state: "Reserved", tone: "warning" as const },
];

export function TablesScreen() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Tables"
        description="A visual snapshot of today’s seating."
        action="Add table"
      />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {tables.map((table) => (
          <Card key={table.name} className="p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border-4 border-muted text-sm font-black">
                {table.name}
              </span>
              <Badge tone={table.tone}>{table.state}</Badge>
            </div>
            <p className="mt-6 text-sm font-bold">
              {table.state === "Occupied"
                ? "Order in progress"
                : table.state === "Reserved"
                  ? "19:30 booking"
                  : "Ready for guests"}
            </p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-success" />
          Available
        </span>
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-destructive" />
          Occupied
        </span>
        <span>
          <i className="mr-2 inline-block size-2 rounded-full bg-warning" />
          Reserved
        </span>
      </div>
    </div>
  );
}

export function MenuScreen() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Menu"
        description="Menu categories and currently available items."
        action="Add item"
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="p-3">
          <p className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Categories
          </p>
          {["Popular", "Grills", "Rice", "Drinks", "Sides", "Dessert"].map(
            (name, index) => (
              <button
                className={`flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm font-semibold ${index === 0 ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                type="button"
                key={name}
              >
                {name}
                <span className="text-xs text-muted-foreground">
                  {index + 2}
                </span>
              </button>
            ),
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_100px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>Item</span>
            <span>Category</span>
            <span className="text-right">Price</span>
          </div>
          {["Jollof Rice", "Waakye Bowl", "Grilled Chicken", "Coke"].map(
            (item, index) => (
              <div
                className="grid grid-cols-[1.5fr_1fr_100px] gap-4 border-b px-5 py-4 last:border-0"
                key={item}
              >
                <span className="font-bold">
                  {item}
                  <Badge className="ml-2" tone="success">
                    Available
                  </Badge>
                </span>
                <span className="text-sm text-muted-foreground">
                  {index < 2 ? "Rice" : index === 2 ? "Grills" : "Drinks"}
                </span>
                <span className="text-right font-bold">
                  GHS {[42, 38, 55, 12][index]}
                </span>
              </div>
            ),
          )}
        </Card>
      </div>
    </div>
  );
}

export function InventoryScreen() {
  const stock = [
    ["Chicken", "18 kg", "warning"],
    ["Rice", "42 kg", "success"],
    ["Cooking Oil", "5 L", "warning"],
    ["Coke", "64 bottles", "success"],
    ["Takeaway Packs", "12 packs", "destructive"],
  ] as const;
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Inventory"
        description="Simple stock overview for the current location."
        action="Add stock item"
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_130px] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Item</span>
          <span>On hand</span>
          <span>Status</span>
        </div>
        {stock.map(([name, amount, state]) => (
          <div
            className="grid grid-cols-[1fr_1fr_130px] gap-4 border-b px-5 py-4 last:border-0"
            key={name}
          >
            <span className="font-bold">{name}</span>
            <span className="text-muted-foreground">{amount}</span>
            <Badge
              tone={
                state === "success"
                  ? "success"
                  : state === "warning"
                    ? "warning"
                    : "destructive"
              }
            >
              {state === "success"
                ? "In stock"
                : state === "warning"
                  ? "Low stock"
                  : "Reorder"}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Settings"
        description="Restaurant setup and operational preferences."
      />
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ["Restaurant", "Business details, location and taxes"],
          ["Printers", "Receipt and kitchen printer connections"],
          ["Staff", "Staff roles and access settings"],
        ].map(([title, description]) => (
          <Card className="p-5" key={title}>
            <h2 className="font-black">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <Button className="mt-6" variant="secondary" size="sm">
              Configure
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
