import { useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Badge, Button, Card, Checkbox, Input, Select } from "@ate05/ui";
import {
  millimetresToDots,
  DEFAULT_PRINTER_DPI,
  type PrinterQueue,
} from "@ate05/printing";
import type { PosPrinterConfig } from "../../lib/pos-client";
import type { PrinterInput } from "../../lib/client-capabilities";

type PrinterRole = "kitchen" | "receipt";
type SaveInput = PrinterInput & { role: PrinterRole };

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
  const [step, setStep] = useState(printer ? 1 : 0);
  const [name, setName] = useState(printer?.name ?? "");
  const [customName, setCustomName] = useState(Boolean(printer?.name));
  const [address, setAddress] = useState(printer?.address ?? "");
  const [connectionType, setConnectionType] = useState<
    PosPrinterConfig["connectionType"]
  >(printer?.connectionType ?? "network");
  const [queueName, setQueueName] = useState(printer?.queueName ?? "");
  const [queues, setQueues] = useState<PrinterQueue[]>([]);
  const [queueError, setQueueError] = useState("");
  const [loadingQueues, setLoadingQueues] = useState(
    native && printer?.connectionType === "system",
  );
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [port, setPort] = useState(String(printer?.port ?? 9100));
  const [role, setRole] = useState<PrinterRole>(printer?.role ?? "receipt");
  const [paperWidth, setPaperWidth] = useState<58 | 80>(
    printer?.paperWidth ?? 80,
  );
  const [cutterEnabled, setCutterEnabled] = useState(
    printer?.cutterEnabled ?? true,
  );
  const [active, setActive] = useState(printer?.active ?? true);
  const [saved, setSaved] = useState<PosPrinterConfig | null>(printer ?? null);
  const [testState, setTestState] = useState<
    "idle" | "testing" | "success" | "failed"
  >("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!native || connectionType !== "system") return;
    let cancelled = false;
    invoke<PrinterQueue[]>("list_printer_queues")
      .then((result) => {
        if (!cancelled) setQueues(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setQueueError(String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingQueues(false);
      });
    return () => {
      cancelled = true;
    };
  }, [native, connectionType, queueRefresh]);
  const dots = useMemo(
    () => millimetresToDots(paperWidth, DEFAULT_PRINTER_DPI),
    [paperWidth],
  );
  const steps = [
    "Connection",
    "Identify",
    "Purpose",
    "Paper profile",
    "Test & save",
  ];

  const unsupportedQueues = queueError.includes("unsupported_platform:");
  const selectedQueue = queues.find((queue) => queue.name === queueName);

  function chooseConnection(type: PosPrinterConfig["connectionType"]) {
    setError("");
    if (type !== connectionType) {
      setConnectionType(type);
      setQueues([]);
      setLoadingQueues(native && type === "system");
      setQueueError("");
    }
    setStep(1);
  }

  function selectQueue(value: string) {
    setQueueName(value);
    if (!customName || !name.trim()) setName(value);
  }

  function backTo(step: number) {
    setStep(step);
    setError("");
    setTestState("idle");
  }

  function nextIdentity(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim())
      return setError("Give this printer a name so staff can recognize it.");
    if (
      connectionType === "system" &&
      (!native || loadingQueues || queueError || !selectedQueue)
    )
      return setError(
        "Select a printer from the current Windows list. Refresh the list if needed.",
      );
    if (connectionType !== "system" && !address.trim())
      return setError("Enter the printer address or device name.");
    const parsedPort = Number(port);
    if (
      connectionType === "network" &&
      (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
    )
      return setError("Port must be between 1 and 65535.");
    setStep(2);
  }

  async function testAndSave() {
    setError("");
    setTestState("testing");
    try {
      const config = await onSave({
        id: saved?.id,
        role,
        name: name.trim(),
        connectionType,
        address: connectionType === "system" ? "" : address.trim(),
        queueName: connectionType === "system" ? queueName : null,
        port:
          connectionType === "network"
            ? Number(port)
            : connectionType === "usb"
              ? (printer?.port ?? null)
              : null,
        paperWidth,
        cutterEnabled,
        active,
      });
      setSaved(config);
      await onTest(config.id);
      setTestState("success");
    } catch (cause) {
      setTestState("failed");
      setError(
        cause instanceof Error
          ? cause.message
          : typeof cause === "string"
            ? cause
            : "The test print could not be completed.",
      );
    }
  }

  return (
    <Card className="min-w-0 border-primary/30 bg-card p-0 shadow-lg shadow-primary/5">
      <div className="border-b bg-primary/[0.04] p-4">
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
      <div className="p-4">
        {step === 0 ? (
          <div className="space-y-3">
            {!native ? (
              <p className="text-sm text-muted-foreground">
                Browser preview cannot inspect hardware. Setup and test printing
                are simulated; no physical printer is contacted.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-label="Network printer"
                className="rounded-xl border p-4 text-left hover:bg-muted/40"
                onClick={() => chooseConnection("network")}
              >
                <p className="font-black">Network printer</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter its network address and port.
                </p>
              </button>
              {native ? (
                <button
                  type="button"
                  aria-label="Printer installed on this PC"
                  className="rounded-xl border p-4 text-left hover:bg-muted/40"
                  onClick={() => chooseConnection("system")}
                >
                  <p className="font-black">Printer installed on this PC</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose a Windows printer queue, including installed USB or
                    Bluetooth printers.
                  </p>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <form className="space-y-4" onSubmit={nextIdentity}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-bold" htmlFor="printer-name">
                  Friendly name
                </label>
                <Input
                  id="printer-name"
                  className="mt-1"
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setCustomName(Boolean(event.target.value.trim()));
                  }}
                  placeholder="Front counter receipt printer"
                />
              </div>
              <div>
                <label
                  className="text-sm font-bold"
                  htmlFor="printer-connection"
                >
                  Connection
                </label>
                <Select
                  id="printer-connection"
                  className="mt-1"
                  value={connectionType}
                  onChange={(event) =>
                    chooseConnection(
                      event.target.value as PosPrinterConfig["connectionType"],
                    )
                  }
                >
                  <option value="network">Network printer</option>
                  {native || connectionType === "system" ? (
                    <option value="system" disabled={!native}>
                      Printer installed on this PC
                    </option>
                  ) : null}
                  {printer?.connectionType === "usb" ? (
                    <option value="usb">Direct USB (unsupported)</option>
                  ) : null}
                </Select>
              </div>
            </div>
            {connectionType === "system" ? (
              <div className="space-y-2">
                <label className="text-sm font-bold" htmlFor="printer-queue">
                  Installed printer queue
                </label>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Select
                    id="printer-queue"
                    className="min-w-0 flex-1 basis-64"
                    value={queueName}
                    disabled={!native || loadingQueues || Boolean(queueError)}
                    onChange={(event) => selectQueue(event.target.value)}
                  >
                    <option value="">Select a printer queue</option>
                    {queueName &&
                    !queues.some((queue) => queue.name === queueName) ? (
                      <option value={queueName}>
                        {queueName} (saved queue; not in current list)
                      </option>
                    ) : null}
                    {queues.map((queue) => (
                      <option key={queue.name} value={queue.name}>
                        {queue.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!native || loadingQueues}
                    onClick={() => {
                      setQueues([]);
                      setLoadingQueues(true);
                      setQueueError("");
                      setQueueRefresh((value) => value + 1);
                    }}
                  >
                    Refresh list
                  </Button>
                </div>
                {loadingQueues ? (
                  <p role="status" className="text-sm">
                    Loading printers installed on this PC…
                  </p>
                ) : null}
                {!native ? (
                  <p role="status" className="text-sm">
                    Browser preview cannot list installed printers. Any preview
                    test is simulated.
                  </p>
                ) : null}
                {selectedQueue ? (
                  <p className="break-words text-xs text-muted-foreground">
                    {selectedQueue.driverName} · Windows port:{" "}
                    {selectedQueue.portName} · {selectedQueue.jobs} queued jobs
                    {selectedQueue.status
                      ? ` · Windows status flags: ${selectedQueue.status}`
                      : ""}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  No IP address or network port is needed. Windows manages this
                  connection.
                </p>
                {selectedQueue && (selectedQueue.status & 0x80) !== 0 ? (
                  <p
                    role="status"
                    className="rounded-lg bg-muted/40 p-3 text-sm"
                  >
                    Windows reports this printer offline. Check its power and
                    USB or Bluetooth connection, open its Windows print queue,
                    and print a Windows test page before trying an ATE05 test
                    slip. Accepted jobs may wait until it reconnects.
                  </p>
                ) : null}
                {!loadingQueues && !queueError && queues.length === 0 ? (
                  native ? (
                    <div
                      role="status"
                      className="rounded-lg bg-muted/40 p-3 text-sm"
                    >
                      <p className="font-semibold">
                        No printers installed on this PC were found.
                      </p>
                      <p className="mt-1">
                        Connect or pair the printer in Windows. Install it under
                        Settings → Bluetooth &amp; devices → Printers &amp;
                        scanners, then print a Windows test page. Return to
                        ATE05 and refresh the list.
                      </p>
                    </div>
                  ) : null
                ) : null}
                {queueError ? (
                  <p
                    role="alert"
                    className="break-words rounded-lg bg-muted/40 p-3 text-sm"
                  >
                    {unsupportedQueues
                      ? "Printers installed on this PC are supported only in the Windows desktop app. Use a network printer on this platform."
                      : `Could not load the Windows printer list. Check that the Windows Print Spooler is running, then refresh the list. ${queueError.slice(0, 200)}`}
                  </p>
                ) : null}
                {!loadingQueues &&
                !queueError &&
                queueName &&
                !selectedQueue &&
                queues.length > 0 ? (
                  <p role="alert" className="text-sm">
                    The saved queue is not in the current Windows list. Select
                    its new name or refresh after reconnecting it.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div>
                  <label
                    className="text-sm font-bold"
                    htmlFor="printer-address"
                  >
                    {connectionType === "network"
                      ? "Address or device name"
                      : "USB device name"}
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
                {connectionType === "network" ? (
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
                ) : null}
              </>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => backTo(0)}>
                Back
              </Button>
              <Button
                type="submit"
                disabled={
                  connectionType === "system" &&
                  (!native ||
                    loadingQueues ||
                    Boolean(queueError) ||
                    !selectedQueue)
                }
              >
                Continue
              </Button>
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
              <Button type="button" variant="ghost" onClick={() => backTo(1)}>
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
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Checkbox
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Printer enabled
            </label>
            <p className="text-xs text-muted-foreground">
              Dots = round((millimetres ÷ 25.4) × DPI). The dot value follows
              the selected printer profile.
            </p>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => backTo(2)}>
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
                <div className="min-w-0 flex-1">
                  <p className="break-words font-black">
                    {name || "Unnamed printer"}
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    {role === "receipt"
                      ? "Customer receipts"
                      : "Kitchen tickets"}{" "}
                    · {paperWidth} mm · {dots} dots at {DEFAULT_PRINTER_DPI} DPI
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    {connectionType === "system"
                      ? `Windows queue: ${queueName}`
                      : connectionType === "network"
                        ? `${address}:${port}`
                        : address}
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
            {testState === "success" &&
            native &&
            connectionType === "system" ? (
              <p role="status" className="rounded-lg bg-muted/40 p-3 text-sm">
                Windows accepted the test job. Confirm that the slip physically
                printed before finishing; an offline printer may keep the job
                waiting.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={testState === "testing"}
                onClick={() => backTo(3)}
              >
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
