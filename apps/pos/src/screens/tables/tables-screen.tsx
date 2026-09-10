import { Badge, Button, Card } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import type { RestaurantTable } from "../../lib/pos-client";

export function TablesScreen({ tables }: { tables: RestaurantTable[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tables"
        description="A visual snapshot of today’s seating."
        action={<Button>Add table</Button>}
      />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {tables.map((table) => (
          <Card key={table.name} className="p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border-4 border-muted text-sm font-black">
                {table.name.replace("Table ", "T")}
              </span>
              <Badge
                tone={
                  table.status === "available"
                    ? "success"
                    : table.status === "reserved"
                      ? "warning"
                      : "destructive"
                }
              >
                {table.status}
              </Badge>
            </div>
            <p className="mt-6 text-sm font-bold">
              {table.status === "occupied"
                ? "Order in progress"
                : table.status === "reserved"
                  ? "Reserved"
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
