import { useState, type ComponentProps, type FormEvent } from "react";
import { Badge, Button, Card, Input } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import { isTauriRuntime } from "../../lib/get-pos-client";
import type { PosPrinterConfig } from "../../lib/pos-client";

type PrinterRole = "kitchen" | "receipt";
type TestState = "idle" | "printing" | "success" | "failed";

function PrinterSettingsCard({
  role,
  printer,
  onSave,
  onTest,
}: {
  role: PrinterRole;
  printer?: PosPrinterConfig;
  onSave: (input: {
    id?: string;
    role: PrinterRole;
    name: string;
    connectionType: "network";
    address: string;
    port: number | null;
    paperWidth: 58 | 80;
    cutterEnabled: boolean;
    active: boolean;
  }) => Promise<void>;
  onTest: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(
    printer?.name ?? `${role === "kitchen" ? "Kitchen" : "Receipt"} printer`,
  );
  const [address, setAddress] = useState(printer?.address ?? "");
  const [port, setPort] = useState(String(printer?.port ?? 9100));
  const [paperWidth, setPaperWidth] = useState<58 | 80>(
    printer?.paperWidth ?? 80,
  );
  const [cutterEnabled, setCutterEnabled] = useState(
    printer?.cutterEnabled ?? true,
  );
  const [active, setActive] = useState(printer?.active ?? true);
  const [error, setError] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");

  const title = role === "kitchen" ? "Kitchen Printer" : "Receipt Printer";
  const description =
    role === "kitchen"
      ? "Print kitchen tickets for preparation and corrections."
      : "Print customer receipts after payment. This can share a physical printer with the kitchen.";

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsedPort = Number(port);
    if (!name.trim() || !address.trim())
      return setError("Enter a printer name and address.");
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
      return setError("Port must be between 1 and 65535.");
    try {
      await onSave({
        id: printer?.id,
        role,
        name,
        connectionType: "network",
        address,
        port: parsedPort,
        paperWidth,
        cutterEnabled,
        active,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save printer.",
      );
    }
  }

  async function test() {
    if (!printer) return;
    setTestState("printing");
    setError("");
    try {
      await onTest(printer.id);
      setTestState("success");
    } catch (cause) {
      setTestState("failed");
      setError(cause instanceof Error ? cause.message : "Printer test failed.");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black">{title}</h2>
            <Badge
              tone={
                printer ? (printer.active ? "success" : "neutral") : "warning"
              }
            >
              {printer
                ? printer.active
                  ? "Configured · Enabled"
                  : "Configured · Disabled"
                : "Not configured"}
            </Badge>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <StatusBadge
          value={
            testState === "success"
              ? "success"
              : testState === "failed"
                ? "failed"
                : printer?.active
                  ? "active"
                  : "inactive"
          }
        />
      </div>
      <form className="p-5" onSubmit={(event) => void save(event)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Printer name
            <Input
              aria-label={`${title} name`}
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`${title} name`}
            />
          </label>
          <label className="text-sm font-semibold">
            Printer address
            <Input
              aria-label={`${title} address`}
              className="mt-1"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="192.168.1.100 or printer.local"
            />
          </label>
          <label className="text-sm font-semibold">
            Port
            <Input
              aria-label={`${title} port`}
              className="mt-1"
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Paper width
            <select
              aria-label={`${title} paper width`}
              className="mt-1 min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={paperWidth}
              onChange={(event) =>
                setPaperWidth(Number(event.target.value) as 58 | 80)
              }
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={cutterEnabled}
              onChange={(event) => setCutterEnabled(event.target.checked)}
            />{" "}
            Cut paper after printing
          </label>
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />{" "}
            Printer enabled
          </label>
          <span className="text-muted-foreground">
            Connection: Network (TCP)
          </span>
        </div>
        {testState === "success" ? (
          <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm font-semibold text-success">
            {isTauriRuntime(window)
              ? "Test print succeeded."
              : "Preview test succeeded. No physical printer was contacted."}
          </p>
        ) : null}
        {testState === "failed" || error ? (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            {error || "Printer test failed."}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
          <Button type="submit">Save changes</Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!printer || testState === "printing"}
            onClick={() => void test()}
          >
            {testState === "printing" ? "Testing…" : "Test print"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SettingsScreen({
  printers,
  onSavePrinter,
  onTestPrinter,
  onRetryPrints,
  onRetryReceiptPrints,
}: {
  printers: PosPrinterConfig[];
  onSavePrinter: (
    input: Parameters<PrinterSettingsCardProps["onSave"]>[0],
  ) => Promise<void>;
  onTestPrinter: (printerId: string) => Promise<void>;
  onRetryPrints: () => Promise<void>;
  onRetryReceiptPrints: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-5">
      <PageHeader
        title="Settings"
        description="Configure printers and operational printing."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <PrinterSettingsCard
          role="kitchen"
          printer={printers.find((printer) => printer.role === "kitchen")}
          onSave={onSavePrinter}
          onTest={onTestPrinter}
        />
        <PrinterSettingsCard
          role="receipt"
          printer={printers.find((printer) => printer.role === "receipt")}
          onSave={onSavePrinter}
          onTest={onTestPrinter}
        />
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Print issues
            </p>
            <h2 className="mt-1 text-lg font-black">Retry saved print jobs</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Retry pending kitchen tickets or customer receipts without
              creating new business records.
            </p>
          </div>
          <Badge tone="neutral">Native and preview supported</Badge>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
          <Button variant="secondary" onClick={() => void onRetryPrints()}>
            Retry kitchen prints
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onRetryReceiptPrints()}
          >
            Retry receipt prints
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Application mode
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">
              {isTauriRuntime(window) ? "Native desktop" : "Browser preview"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isTauriRuntime(window)
                ? "Physical printer communication is available."
                : "Preview printing is simulated; no physical printer is contacted."}
            </p>
          </div>
          <StatusBadge value={isTauriRuntime(window) ? "active" : "pending"} />
        </div>
      </Card>
    </div>
  );
}

type PrinterSettingsCardProps = ComponentProps<typeof PrinterSettingsCard>;
