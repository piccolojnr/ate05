import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input } from "@ate05/ui";
import { Icon } from "./icons";
import { StatusBadge } from "./status-badge";
import {
  formatGhs,
  type PaymentMethod,
  type PosClient,
  type PosOrder,
} from "../lib/pos-client";

type PaymentInput = Parameters<PosClient["recordPayment"]>[0];

function parseMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const wholeMinor = Number(whole) * 100;
  const fractionMinor = Number(fraction.padEnd(2, "0"));
  const result = wholeMinor + fractionMinor;
  return Number.isSafeInteger(result) ? result : null;
}

function moneyInput(minor: number) {
  return (minor / 100).toFixed(2);
}

function paymentLabel(method: PaymentMethod) {
  return method === "mobile_money"
    ? "Mobile money"
    : method[0]!.toUpperCase() + method.slice(1);
}

function CheckoutOrderSummary({ order }: { order: PosOrder }) {
  return (
    <Card className="shadow-none">
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Order review
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">
            #{String(order.orderNumber).padStart(4, "0")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.orderType === "dine_in"
              ? (order.tableName ?? "Table not selected")
              : "TAKEAWAY"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusBadge kind="order" value={order.status} />
          <StatusBadge kind="payment" value={order.paymentStatus} />
        </div>
      </div>
      <div className="divide-y">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">
                {item.quantity} × {item.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatGhs(item.unitPriceMinor)} each
                {item.notes ? ` · ${item.notes}` : ""}
              </p>
            </div>
            <p className="shrink-0 tabular-nums font-bold">
              {formatGhs(item.lineTotalMinor)}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t bg-muted/20 p-4 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatGhs(order.subtotalMinor)}</span>
        </div>
        <div className="flex justify-between text-base font-black">
          <span>Total</span>
          <span className="tabular-nums">{formatGhs(order.totalMinor)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Paid</span>
          <span className="tabular-nums">
            {formatGhs(order.amountPaidMinor)}
          </span>
        </div>
        <div className="flex justify-between text-lg font-black text-primary">
          <span>Remaining</span>
          <span className="tabular-nums">
            {formatGhs(order.amountDueMinor)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function PaymentMethodSelector({
  method,
  onChange,
}: {
  method: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold">Payment method</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["cash", "mobile_money", "card", "other"] as PaymentMethod[]).map(
          (entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={method === entry}
              onClick={() => onChange(entry)}
              className={`min-h-12 rounded-md border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${method === entry ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50 hover:bg-muted"}`}
            >
              {paymentLabel(entry)}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function PaymentResult({
  order,
  amountMinor,
  method,
  changeMinor,
}: {
  order: PosOrder;
  amountMinor: number;
  method: PaymentMethod;
  changeMinor: number;
}) {
  return (
    <div className="rounded-md border border-success/30 bg-success/10 p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
          <span aria-hidden="true">✓</span>
        </div>
        <div>
          <p className="font-black">Payment recorded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatGhs(amountMinor)} recorded by {paymentLabel(method)}.
          </p>
          {changeMinor > 0 ? (
            <p className="mt-1 text-sm font-bold">
              Change due: {formatGhs(changeMinor)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-success/20 pt-3 text-sm">
        <div>
          <p className="text-muted-foreground">Total paid</p>
          <p className="mt-1 tabular-nums font-black">
            {formatGhs(order.amountPaidMinor)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining</p>
          <p className="mt-1 tabular-nums font-black text-primary">
            {formatGhs(order.amountDueMinor)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReceiptView({
  order,
  businessName,
  cashierName,
  onRetry,
  onReprint,
}: {
  order: PosOrder;
  businessName: string;
  cashierName: string;
  onRetry: () => Promise<void>;
  onReprint: () => Promise<void>;
}) {
  const receipt = order.receipt;
  const [busy, setBusy] = useState(false);
  if (!receipt) return null;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="shadow-none">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Receipt ready
          </p>
          <h3 className="mt-1 text-xl font-black">
            #{String(receipt.receiptNumber).padStart(6, "0")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {businessName} · Cashier {cashierName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payment is complete. This does not release the table.
          </p>
        </div>
        <StatusBadge kind="print" value={receipt.printStatus} />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Receipt total</span>
          <span className="tabular-nums font-bold">
            {formatGhs(receipt.totalMinor)}
          </span>
        </div>
        <div className="space-y-1 border-t pt-3">
          {receipt.payments.map((payment) => (
            <div key={payment.id} className="flex justify-between text-sm">
              <span>{paymentLabel(payment.method)}</span>
              <span className="tabular-nums">
                {formatGhs(payment.amountMinor)}
              </span>
            </div>
          ))}
        </div>
        {receipt.printStatus !== "printed" ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-bold">Payment recorded; receipt not printed.</p>
            <p className="mt-1 text-muted-foreground">
              The receipt is saved. Check the printer and retry when ready.
            </p>
            {receipt.lastPrintError ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {receipt.lastPrintError}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md bg-success/10 p-3 text-sm font-bold text-success">
            Receipt sent to the printer.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {receipt.printStatus !== "printed" ? (
            <Button disabled={busy} onClick={() => void run(onRetry)}>
              {busy ? "Printing…" : "Retry print"}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(onReprint)}
          >
            Reprint receipt
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function CheckoutWorkspace({
  order,
  businessName,
  cashierName,
  onBack,
  onRecordPayment,
  onRetryReceiptPrint,
  onReprintReceipt,
  onCompleteOrder,
}: {
  order: PosOrder;
  businessName: string;
  cashierName: string;
  onBack: () => void;
  onRecordPayment: (input: PaymentInput) => Promise<PosOrder>;
  onRetryReceiptPrint: () => Promise<void>;
  onReprintReceipt: () => Promise<void>;
  onCompleteOrder: () => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(moneyInput(order.amountDueMinor));
  const [tendered, setTendered] = useState(moneyInput(order.amountDueMinor));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayment, setLastPayment] = useState<{
    amountMinor: number;
    method: PaymentMethod;
    changeMinor: number;
  } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const amountMinor = parseMinor(amount);
  const tenderedMinor = parseMinor(tendered);
  const changeMinor =
    amountMinor !== null && tenderedMinor !== null
      ? Math.max(0, tenderedMinor - amountMinor)
      : 0;
  const canPay =
    amountMinor !== null &&
    amountMinor > 0 &&
    amountMinor <= order.amountDueMinor &&
    (method !== "cash" ||
      (tenderedMinor !== null && tenderedMinor >= amountMinor));

  async function submit() {
    if (!canPay || amountMinor === null) {
      setError(
        method === "cash" &&
          tenderedMinor !== null &&
          amountMinor !== null &&
          tenderedMinor < amountMinor
          ? "Cash tendered must cover the payment."
          : "Enter a valid amount up to the remaining balance.",
      );
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await onRecordPayment({
        orderId: order.id,
        method,
        amountMinor,
        cashTenderedMinor: method === "cash" ? tenderedMinor : null,
        reference: reference.trim() || null,
        idempotencyKey: crypto.randomUUID(),
      });
      setLastPayment({
        amountMinor,
        method,
        changeMinor: method === "cash" ? changeMinor : 0,
      });
      setReference("");
      setAmount(moneyInput(updated.amountDueMinor));
      setTendered(moneyInput(updated.amountDueMinor));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be confirmed. The saved order is being checked.",
      );
    } finally {
      setBusy(false);
    }
  }

  const activeOrder = [
    "open",
    "sent_to_kitchen",
    "preparing",
    "ready",
  ].includes(order.status);
  const canComplete = order.paymentStatus === "paid" && activeOrder;

  return (
    <main
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      aria-label="Checkout"
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 pb-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-primary">ATE05 Checkout</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              Review and take payment
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Payment, receipt printing, and table completion are separate
              steps.
            </p>
          </div>
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            <Icon name="arrow" width="16" height="16" className="rotate-180" />
            Return to order
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
          <CheckoutOrderSummary order={order} />
          <div className="space-y-4">
            {lastPayment ? (
              <PaymentResult
                order={order}
                amountMinor={lastPayment.amountMinor}
                method={lastPayment.method}
                changeMinor={lastPayment.changeMinor}
              />
            ) : null}
            {order.amountDueMinor > 0 ? (
              <Card className="shadow-none">
                <div className="border-b p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                        Payment
                      </p>
                      <h2 className="mt-1 text-xl font-black">
                        {formatGhs(order.amountDueMinor)} due
                      </h2>
                    </div>
                    <Badge tone="warning">Not paid</Badge>
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  <PaymentMethodSelector method={method} onChange={setMethod} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-bold">
                      Amount to record
                      <Input
                        ref={amountRef}
                        aria-label="Payment amount"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submit();
                          }
                        }}
                        inputMode="decimal"
                        className="mt-2 min-h-12 tabular-nums"
                      />
                    </label>
                    {method === "cash" ? (
                      <label className="block text-sm font-bold">
                        Cash tendered
                        <Input
                          aria-label="Cash tendered"
                          value={tendered}
                          onChange={(event) => setTendered(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submit();
                            }
                          }}
                          inputMode="decimal"
                          className="mt-2 min-h-12 tabular-nums"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="mt-1"
                          onClick={() => {
                            const exact = moneyInput(order.amountDueMinor);
                            setAmount(exact);
                            setTendered(exact);
                          }}
                        >
                          Exact amount
                        </Button>
                      </label>
                    ) : (
                      <label className="block text-sm font-bold">
                        Reference{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                        <Input
                          aria-label="Payment reference"
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          className="mt-2 min-h-12"
                          placeholder="Terminal or transaction reference"
                        />
                      </label>
                    )}
                  </div>
                  {method === "cash" ? (
                    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>Change due</span>
                      <strong className="tabular-nums">
                        {formatGhs(changeMinor)}
                      </strong>
                    </div>
                  ) : (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                      Record the payment after confirming it was received
                      through the external {paymentLabel(method).toLowerCase()}{" "}
                      channel. ATE05 does not verify providers in this workflow.
                    </p>
                  )}
                  {error ? (
                    <p
                      role="alert"
                      className="rounded-md bg-destructive/10 p-3 text-sm font-semibold text-destructive"
                    >
                      {error}
                    </p>
                  ) : null}
                  <div className="rounded-md border border-dashed p-3 text-sm">
                    <p className="font-bold">Review payment</p>
                    <p className="mt-1 text-muted-foreground">
                      {formatGhs(amountMinor ?? 0)} by {paymentLabel(method)} ·
                      remaining after this payment{" "}
                      {formatGhs(
                        Math.max(0, order.amountDueMinor - (amountMinor ?? 0)),
                      )}
                    </p>
                  </div>
                  <Button
                    className="min-h-12 w-full"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy ? "Recording payment…" : "Confirm Payment"}
                  </Button>
                </div>
              </Card>
            ) : null}

            {order.receipt ? (
              <ReceiptView
                order={order}
                businessName={businessName}
                cashierName={cashierName}
                onRetry={onRetryReceiptPrint}
                onReprint={onReprintReceipt}
              />
            ) : null}

            {canComplete ? (
              <Card className="border-primary/20 bg-primary/[0.03] p-4 shadow-none">
                <p className="font-bold">Payment is complete</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Completing this order will release{" "}
                  {order.tableName ?? "the table"}. Payment alone has not
                  released it.
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => void onCompleteOrder()}
                >
                  {order.orderType === "dine_in"
                    ? "Complete order · Release table"
                    : "Complete order"}
                </Button>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
