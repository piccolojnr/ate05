import { useState, type ComponentProps, type FormEvent } from "react";
import { Badge, Button, Card, Checkbox, Input, Select } from "@ate05/ui";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import { isTauriRuntime } from "../../lib/get-pos-client";
import type {
  BackupInfo,
  DatabaseHealth,
  AuthUser,
  PosPrinterConfig,
} from "../../lib/pos-client";

type PrinterRole = "kitchen" | "receipt";
type TestState = "idle" | "printing" | "success" | "failed";

function StaffSection({
  staff,
  onCreate,
  onUpdate,
}: {
  staff: AuthUser[];
  onCreate: (name: string, role: string, pin: string) => Promise<void>;
  onUpdate: (input: {
    userId: string;
    name: string;
    role: string;
    active: boolean;
    pin?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("cashier");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !/^\d{4,6}$/.test(pin))
      return setError("Enter a staff name and a 4–6 digit PIN.");
    setWorking(true);
    try {
      await onCreate(name, role, pin);
      setName("");
      setPin("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create staff member.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <Card className="p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Staff
        </p>
        <h2 className="mt-1 text-lg font-black">Local staff accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage PIN access without an internet connection. PINs are never
          displayed.
        </p>
      </div>
      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
        onSubmit={(event) => void create(event)}
      >
        <label className="text-sm font-semibold">
          Name
          <Input
            className="mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Staff name"
          />
        </label>
        <label className="text-sm font-semibold">
          Role
          <Select
            className="mt-1 min-h-10"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="Staff role"
          >
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="kitchen">Kitchen</option>
            <option value="inventory">Inventory</option>
            <option value="waiter">Waiter</option>
          </Select>
        </label>
        <label className="text-sm font-semibold">
          PIN
          <Input
            className="mt-1"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            aria-label="New staff PIN"
          />
        </label>
        <Button className="self-end" disabled={working}>
          {working ? "Adding…" : "Add staff"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 divide-y border-t">
        {staff.map((user) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            key={user.id}
          >
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                {user.role} · {user.active ? "Active" : "Inactive"}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                void onUpdate({
                  userId: user.id,
                  name: user.name,
                  role: user.role,
                  active: !user.active,
                })
              }
            >
              {user.active ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

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
        {testState === "success" ? (
          <Badge tone="success">Test succeeded</Badge>
        ) : (
          <StatusBadge
            value={
              testState === "failed"
                ? "failed"
                : printer?.active
                  ? "active"
                  : "inactive"
            }
          />
        )}
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
            <Select
              aria-label={`${title} paper width`}
              className="mt-1 min-h-10"
              value={paperWidth}
              onChange={(event) =>
                setPaperWidth(Number(event.target.value) as 58 | 80)
              }
            >
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </Select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2 font-semibold">
            <Checkbox
              type="checkbox"
              checked={cutterEnabled}
              onChange={(event) => setCutterEnabled(event.target.checked)}
            />{" "}
            Cut paper after printing
          </label>
          <label className="flex items-center gap-2 font-semibold">
            <Checkbox
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
  backups,
  databaseHealth,
  onBackupNow,
  onRestoreBackup,
  staff,
  onCreateStaff,
  onUpdateStaff,
}: {
  printers: PosPrinterConfig[];
  onSavePrinter: (
    input: Parameters<PrinterSettingsCardProps["onSave"]>[0],
  ) => Promise<void>;
  onTestPrinter: (printerId: string) => Promise<void>;
  onRetryPrints: () => Promise<void>;
  onRetryReceiptPrints: () => Promise<void>;
  backups: BackupInfo[];
  databaseHealth: DatabaseHealth | null;
  onBackupNow: () => Promise<void>;
  onRestoreBackup: (fileName: string) => Promise<void>;
  staff: AuthUser[];
  onCreateStaff: (name: string, role: string, pin: string) => Promise<void>;
  onUpdateStaff: (input: {
    userId: string;
    name: string;
    role: string;
    active: boolean;
    pin?: string;
  }) => Promise<void>;
}) {
  const [backupState, setBackupState] = useState<"idle" | "working">("idle");
  const [selectedBackup, setSelectedBackup] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const native = isTauriRuntime(window);
  const latestAutomatic = backups.find((backup) => backup.kind === "automatic");
  const latestManual = backups.find((backup) => backup.kind === "manual");
  const formatBackupDate = (backup?: BackupInfo) =>
    backup
      ? new Date(backup.createdAt * 1000).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Not created yet";

  async function createBackup() {
    setBackupState("working");
    try {
      await onBackupNow();
    } finally {
      setBackupState("idle");
    }
  }

  async function restore() {
    if (!selectedBackup) return;
    setBackupState("working");
    try {
      await onRestoreBackup(selectedBackup);
      setSelectedBackup("");
      setConfirmRestore(false);
    } finally {
      setBackupState("idle");
    }
  }

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
      <StaffSection
        staff={staff}
        onCreate={onCreateStaff}
        onUpdate={onUpdateStaff}
      />
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Data &amp; backup
            </p>
            <h2 className="mt-1 text-lg font-black">
              Protect local restaurant data
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Daily backups are kept on this computer. Before restoring, ATE05
              creates a safety copy of the current database.
            </p>
          </div>
          <Badge
            tone={
              native
                ? databaseHealth?.healthy
                  ? "success"
                  : "warning"
                : "neutral"
            }
          >
            {native
              ? databaseHealth?.healthy
                ? "Database healthy"
                : "Health check unavailable"
              : "Browser preview"}
          </Badge>
        </div>
        <div className="mt-5 grid gap-3 border-y py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Last automatic backup</p>
            <p className="mt-1 font-semibold">
              {formatBackupDate(latestAutomatic)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last manual backup</p>
            <p className="mt-1 font-semibold">
              {formatBackupDate(latestManual)}
            </p>
          </div>
        </div>
        {!native ? (
          <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            Backup and restore are available in the native desktop app. Browser
            preview uses simulated local state and does not create SQLite files.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Button
            disabled={!native || backupState === "working"}
            onClick={() => void createBackup()}
          >
            {backupState === "working" ? "Working…" : "Back Up Now"}
          </Button>
          {native && backups.length ? (
            <label className="min-w-64 text-sm font-semibold">
              Restore from backup
              <Select
                aria-label="Restore from backup"
                className="mt-1 min-h-11 font-normal"
                value={selectedBackup}
                onChange={(event) => {
                  setSelectedBackup(event.target.value);
                  setConfirmRestore(false);
                }}
              >
                <option value="">Choose a validated backup</option>
                {backups.map((backup) => (
                  <option key={backup.fileName} value={backup.fileName}>
                    {backup.kind.replace("_", " ")} · {formatBackupDate(backup)}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {native && selectedBackup && !confirmRestore ? (
            <Button variant="secondary" onClick={() => setConfirmRestore(true)}>
              Restore selected backup
            </Button>
          ) : null}
        </div>
        {confirmRestore ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-4">
            <p className="font-bold">Replace current local data?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A safety backup will be created first. The selected backup will
              replace the current database and the application data will reload.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmRestore(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={backupState === "working"}
                onClick={() => void restore()}
              >
                {backupState === "working" ? "Restoring…" : "Confirm restore"}
              </Button>
            </div>
          </div>
        ) : null}
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
