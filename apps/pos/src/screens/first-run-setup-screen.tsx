import { useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@ate05/ui";
import type { AuthBootstrap } from "../lib/pos-client";

type StarterPack = "empty" | "rice" | "counter_service";

const packs: Array<{ id: StarterPack; name: string; description: string }> = [
  {
    id: "empty",
    name: "Start empty",
    description: "Configure your menu later.",
  },
  {
    id: "rice",
    name: "ATE05 Rice Menu",
    description: "Rice dishes, local favourites, proteins and soups.",
  },
  {
    id: "counter_service",
    name: "Counter service",
    description: "A compact everyday menu for quick service.",
  },
];

export function FirstRunSetupScreen({
  bootstrap,
  onProgress,
  onComplete,
}: {
  bootstrap: AuthBootstrap;
  onProgress: (input: {
    step: number;
    businessName: string;
    ownerName: string;
    starterPack: string;
    tableCount: number;
  }) => Promise<void>;
  onComplete: (input: {
    businessName: string;
    ownerUserId: string;
    ownerName: string;
    ownerPin: string;
    starterPack: StarterPack;
    tableCount: number;
  }) => Promise<void>;
}) {
  const owner = useMemo(
    () => bootstrap.users.find((user) => user.role === "owner" && user.active),
    [bootstrap.users],
  );
  const [step, setStep] = useState(bootstrap.setupStep);
  const [businessName, setBusinessName] = useState(
    bootstrap.setupBusinessName || bootstrap.businessName || "ATE05",
  );
  const [ownerName, setOwnerName] = useState(
    bootstrap.setupOwnerName || owner?.name || "",
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [starterPack, setStarterPack] = useState<StarterPack>(
    (bootstrap.setupStarterPack as StarterPack) || "rice",
  );
  const [tableCount, setTableCount] = useState(
    String(bootstrap.setupTableCount ?? 10),
  );
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function next() {
    setError("");
    if (step === 1) {
      if (!businessName.trim()) return setError("Restaurant name is required.");
      if (!ownerName.trim()) return setError("Owner name is required.");
      if (!/^\d{4,6}$/.test(pin)) return setError("PIN must be 4 to 6 digits.");
      if (pin !== confirmPin) return setError("PINs do not match.");
    }
    if (step === 2) {
      const count = Number(tableCount);
      if (!Number.isInteger(count) || count < 0 || count > 100)
        return setError("Choose between 0 and 100 tables.");
    }
    const nextStep = Math.min(3, step + 1);
    try {
      await onProgress({
        step: nextStep,
        businessName,
        ownerName,
        starterPack,
        tableCount: Number(tableCount),
      });
      setStep(nextStep);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save setup progress.",
      );
    }
  }

  async function finish() {
    if (!owner) return setError("An active owner account is required.");
    setWorking(true);
    setError("");
    try {
      await onComplete({
        businessName: businessName.trim(),
        ownerUserId: owner.id,
        ownerName: ownerName.trim(),
        ownerPin: pin,
        starterPack,
        tableCount: Number(tableCount),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to finish setup.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-8 text-foreground">
      <Card className="w-full max-w-2xl p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              ATE05 POS
            </p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Setup · Step {step + 1} of 4
            </p>
          </div>
          <div
            className="h-2 w-32 overflow-hidden rounded-full bg-muted"
            aria-label={`Setup progress ${step + 1} of 4`}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((step + 1) / 4) * 100}%` }}
            />
          </div>
        </div>
        {step === 0 ? (
          <section className="mt-12">
            <h1 className="text-3xl font-black">
              Let&apos;s set up your restaurant.
            </h1>
            <p className="mt-3 max-w-lg text-muted-foreground">
              ATE05 runs locally on this computer. You can change these settings
              later.
            </p>
          </section>
        ) : null}
        {step === 1 ? (
          <section className="mt-8 space-y-4">
            <div>
              <h1 className="text-2xl font-black">Restaurant and owner</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create the secure administrator account for this terminal.
              </p>
            </div>
            <label className="block text-sm font-semibold">
              Restaurant name
              <Input
                className="mt-1"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Owner name
              <Input
                className="mt-1"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Owner PIN
                <Input
                  className="mt-1"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>
              <label className="block text-sm font-semibold">
                Confirm PIN
                <Input
                  className="mt-1"
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(event) =>
                    setConfirmPin(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                />
              </label>
            </div>
          </section>
        ) : null}
        {step === 2 ? (
          <section className="mt-8 space-y-5">
            <div>
              <h1 className="text-2xl font-black">Starting menu and tables</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Starter prices are editable after setup. No inventory is created
                from menu items.
              </p>
            </div>
            <label className="block text-sm font-semibold">
              Starter menu
              <Select
                className="mt-1 min-h-11"
                value={starterPack}
                onChange={(event) =>
                  setStarterPack(event.target.value as StarterPack)
                }
              >
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name} — {pack.description}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-semibold">
              Number of tables
              <Input
                className="mt-1"
                type="number"
                min="0"
                max="100"
                value={tableCount}
                onChange={(event) => setTableCount(event.target.value)}
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Tables are created as Available and can be edited later.
              </span>
            </label>
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Printers are optional. Configure kitchen and receipt printers
              later in Settings.
            </p>
          </section>
        ) : null}
        {step === 3 ? (
          <section className="mt-8 space-y-4">
            <div>
              <h1 className="text-2xl font-black">Review setup</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your choices will be saved together. You can manage them later.
              </p>
            </div>
            <dl className="divide-y rounded-md border px-4">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Restaurant</dt>
                <dd className="font-semibold">{businessName}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Owner</dt>
                <dd className="font-semibold">{ownerName}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Menu</dt>
                <dd className="font-semibold">
                  {packs.find((pack) => pack.id === starterPack)?.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Tables</dt>
                <dd className="font-semibold">{tableCount || "None"}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            variant="secondary"
            disabled={working || step === 0}
            onClick={() => {
              setError("");
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button onClick={next}>
              {step === 0 ? "Get started" : "Continue"}
            </Button>
          ) : (
            <Button disabled={working} onClick={() => void finish()}>
              {working ? "Finishing setup…" : "Finish setup"}
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
