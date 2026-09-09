import { Badge, Button, Card } from "@ate05/ui";
import { Icon } from "./icons";

export interface OrderLine {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export function OrderPanel({
  lines,
  onQuantityChange,
}: {
  lines: OrderLine[];
  onQuantityChange: (id: string, amount: number) => void;
}) {
  const subtotal = lines.reduce(
    (total, line) => total + line.price * line.quantity,
    0,
  );
  return (
    <aside
      className="flex min-h-0 w-[380px] shrink-0 flex-col rounded-lg border bg-card shadow-card max-xl:w-[340px] max-lg:hidden"
      aria-label="Current order"
    >
      <div className="border-b p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current order
            </p>
            <h2 className="mt-1 text-lg font-black">#A-1042</h2>
          </div>
          <Button size="icon" variant="ghost" aria-label="More order options">
            <Icon name="more" />
          </Button>
        </div>
        <div className="mt-4 flex gap-2">
          <Badge tone="primary">Dine in</Badge>
          <Badge>Table 06</Badge>
          <Badge>2 guests</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {lines.map((line) => (
          <Card key={line.id} className="p-3 shadow-none">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-bold">{line.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  GHS {line.price.toFixed(2)} each
                </p>
              </div>
              <p className="font-bold">
                GHS {(line.price * line.quantity).toFixed(2)}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-8 px-2"
                  aria-label={`Decrease ${line.name}`}
                  onClick={() => onQuantityChange(line.id, -1)}
                >
                  <Icon name="minus" width="16" height="16" />
                </Button>
                <span className="min-w-7 text-center text-sm font-bold">
                  {line.quantity}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-8 px-2"
                  aria-label={`Increase ${line.name}`}
                  onClick={() => onQuantityChange(line.id, 1)}
                >
                  <Icon name="plus" width="16" height="16" />
                </Button>
              </div>
              <button
                className="text-xs font-bold text-destructive hover:underline"
                type="button"
                onClick={() => onQuantityChange(line.id, -line.quantity)}
              >
                Remove
              </button>
            </div>
          </Card>
        ))}
      </div>
      <div className="border-t p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>GHS {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Tax</span>
            <span>GHS 0.00</span>
          </div>
          <div className="flex justify-between rounded-md bg-muted px-3 py-3 text-lg font-black">
            <span>Total</span>
            <span>GHS {subtotal.toFixed(2)}</span>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button className="w-full !bg-primary hover:!bg-primary/90">
            Send to Kitchen
          </Button>
          <Button variant="secondary" className="w-full">
            Take Payment <Icon name="arrow" width="17" height="17" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
