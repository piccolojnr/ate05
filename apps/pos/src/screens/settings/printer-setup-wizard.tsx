import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, Checkbox, Input, Select } from "@ate05/ui";
import { millimetresToDots, DEFAULT_PRINTER_DPI } from "@ate05/printing";
import type { PosPrinterConfig } from "../../lib/pos-client";

type PrinterRole = "kitchen" | "receipt";
type SaveInput = {
  id?: string;
  role: PrinterRole;
  name: string;
  connectionType: "network";
  address: string;
  port: number | null;
  paperWidth: 58 | 80;
  cutterEnabled: boolean;
  active: boolean;
};

export function PrinterSetupWizard({
  printer,
  native,
  onSave,
  onTest,
  onClose,
}: {
  printer?: PosPrinterConfig;
  native: boolean;
  onSave: (input: SaveInput) => Promise<PosPrinterConfig>;
  onTest: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(printer?.name ?? "");
  const [address, setAddress] = useState(printer?.address ?? "");
  const [port, setPort] = useState(String(printer?.port ?? 9100));
  const [role, setRole] = useState<PrinterRole>(printer?.role ?? "receipt");
  const [paperWidth, setPaperWidth] = useState<58 | 80>(
    printer?.paperWidth ?? 80,
  );
  const [cutterEnabled, setCutterEnabled] = useState(
    printer?.cutterEnabled ?? true,
  );
  const [saved, setSaved] = useState<PosPrinterConfig | null>(printer ?? null);
  const [testState, setTestState] = useState<
    "idle" | "testing" | "success" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const dots = useMemo(
    () => millimetresToDots(paperWidth, DEFAULT_PRINTER_DPI),
    [paperWidth],
  );
  const steps = [
    "Discover",
    "Identify",
    "Purpose",
    "Paper profile",
    "Test & save",
  ];

  function discover() {
    setError("");
    if (!native) {
      setAddress("");
      setStep(1);
      return;
    }
    setStep(1);
  }

  function nextIdentity(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim())
      return setError("Give this printer a name so staff can recognize it.");
    if (!address.trim())
      return setError("Enter the printer address or device name.");
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
      return setError("Port must be between 1 and 65535.");
    setStep(2);
  }

  async function testAndSave() {
    setError("");
    try {
      const config = await onSave({
        id: saved?.id,
        role,
        name: name.trim(),
        connectionType: "network",
        address: address.trim(),
        port: Number(port),
        paperWidth,
        cutterEnabled,
        active: true,
      });
      setSaved(config);
      setTestState("testing");
      await onTest(config.id);
      setTestState("success");
    } catch (cause) {
      setTestState("failed");
      setError(
        cause instanceof Error
          ? cause.message
          : "The test print could not be completed.",
      );
    }
  }

  return (
    <Card className="border-primary/30 bg-card p-0 shadow-lg shadow-primary/5">
      <div className="border-b bg-primary/[0.04] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Printer setup
            </p>
            <h2 className="mt-1 text-xl font-black">
              {printer ? "Update a printer" : "Add a printer"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A short guided setup for reliable receipts and kitchen tickets.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <ol
          className="mt-5 grid grid-cols-5 gap-1"
          aria-label="Printer setup progress"
        >
          {steps.map((label, index) => (
            <li
              key={label}
              className={`border-t-2 pt-2 text-[11px] font-bold ${index <= step ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}
            >
              <span className="mr-1">{index + 1}.</span>
              {label}
            </li>
          ))}
        </ol>
      </div>
      <div className="p-5">
        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 p-5">
              <p className="text-lg font-black">Find a printer</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {native
                  ? "Use a known network printer, then confirm its identity."
                  : "Browser preview cannot inspect hardware. You can still configure a deterministic simulated printer."}
              </p>
              <Button className="mt-5" type="button" onClick={discover}>
                {native ? "Start discovery" : "Continue to manual setup"}
              </Button>
            </div>
            <div className="rounded-xl border border-dashed p-5">
              <p className="text-lg font-black">Enter manually</p>
              <p className="mt-2 text-sm text-muted-foreground">
                For a network printer, you only need its name, address, and
                port.
              </p>
              <Button
                className="mt-5"
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
              >
                Enter manually
              </Button>
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <form className="space-y-4" onSubmit={nextIdentity}>
            <div>
              <label className="text-sm font-bold" htmlFor="printer-name">
                Friendly name
              </label>
              <Input
                id="printer-name"
                className="mt-1"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Front counter receipt printer"
              />
            </div>
            <div>
              <label className="text-sm font-bold" htmlFor="printer-address">
                Address or device name
              </label>
              <Input
                id="printer-address"
                className="mt-1"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="192.168.1.100 or printer.local"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This stays on the local computer.
              </p>
            </div>
            <div className="max-w-xs">
              <label className="text-sm font-bold" htmlFor="printer-port">
                Network port
              </label>
              <Input
                id="printer-port"
                className="mt-1"
                type="number"
                min="1"
                max="65535"
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold">
                What should this printer print?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This controls where ATE05 sends each document.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRole("receipt")}
                className={`rounded-xl border p-4 text-left ${role === "receipt" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/40"}`}
              >
                <p className="font-black">Customer receipts</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Printed after payment.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setRole("kitchen")}
                className={`rounded-xl border p-4 text-left ${role === "kitchen" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/40"}`}
              >
                <p className="font-black">Kitchen tickets</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent to the preparation area.
                </p>
              </button>
            </div>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold" htmlFor="paper-width">
                Paper width
              </label>
              <Select
                id="paper-width"
                className="mt-1 max-w-xs"
                value={paperWidth}
                onChange={(event) =>
                  setPaperWidth(Number(event.target.value) as 58 | 80)
                }
              >
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Printable width</p>
                <p className="mt-1 text-xl font-black">{dots} dots</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Printer profile</p>
                <p className="mt-1 text-xl font-black">
                  {DEFAULT_PRINTER_DPI} DPI
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm font-semibold">
                <Checkbox
                  type="checkbox"
                  checked={cutterEnabled}
                  onChange={(event) => setCutterEnabled(event.target.checked)}
                />{" "}
                Cutter enabled
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Dots = round((millimetres ÷ 25.4) × DPI). The dot value follows
              the selected printer profile.
            </p>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="button" onClick={() => setStep(4)}>
                Review test
              </Button>
            </div>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">{name || "Unnamed printer"}</p>
                  <p className="text-sm text-muted-foreground">
                    {role === "receipt"
                      ? "Customer receipts"
                      : "Kitchen tickets"}{" "}
                    · {paperWidth} mm · {dots} dots at {DEFAULT_PRINTER_DPI} DPI
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {address}:{port}
                  </p>
                </div>
                <Badge
                  tone={
                    testState === "success"
                      ? "success"
                      : testState === "failed"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {testState === "success"
                    ? "Tested"
                    : testState === "testing"
                      ? "Testing"
                      : "Not tested"}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The test page creates no order, payment, receipt, or kitchen
              ticket. In browser preview it is simulated.
            </p>
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive"
              >
                {error}
              </p>
            ) : null}
            {testState === "success" && !native ? (
              <p className="rounded-lg bg-success/10 p-3 text-sm font-semibold text-success">
                Preview test succeeded. No physical printer was contacted.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={testState === "testing"}
                  onClick={() => void testAndSave()}
                >
                  {testState === "testing" ? "Testing…" : "Print test page"}
                </Button>
                <Button
                  type="button"
                  disabled={!saved || testState !== "success"}
                  onClick={onClose}
                >
                  Save &amp; finish
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {step < 4 && error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
