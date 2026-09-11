import { useState, type FormEvent } from "react";
import { Button, Card, Input, Select } from "@ate05/ui";
import type { AuthBootstrap, SessionUser } from "../lib/pos-client";

export function AuthScreen({
  bootstrap,
  onLogin,
  onSetupPin,
}: {
  bootstrap: AuthBootstrap;
  onLogin: (userId: string, pin: string) => Promise<SessionUser>;
  onSetupPin: (userId: string, pin: string) => Promise<void>;
}) {
  const owner = bootstrap.users.find(
    (user) => user.role === "owner" && user.active,
  );
  const [userId, setUserId] = useState(
    owner?.id ?? bootstrap.users[0]?.id ?? "",
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const setup = bootstrap.requiresOwnerPin;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN must be 4 to 6 digits.");
    setWorking(true);
    try {
      if (setup) await onSetupPin(userId, pin);
      await onLogin(userId, pin);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          ATE05 POS
        </p>
        <h1 className="mt-2 text-2xl font-black">
          {setup ? "Set up owner PIN" : "Sign in to continue"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setup
            ? "Create the first secure PIN for the restaurant owner."
            : "Select your staff account and enter your PIN."}
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm font-semibold">
            Staff member
            <Select
              className="mt-1 min-h-10"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={setup}
            >
              {bootstrap.users
                .filter(
                  (user) =>
                    user.active &&
                    (setup ? user.id === owner?.id : user.hasPin),
                )
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.role}
                  </option>
                ))}
            </Select>
          </label>
          <label className="block text-sm font-semibold">
            PIN
            <Input
              className="mt-1 text-center text-xl tracking-[0.35em]"
              inputMode="numeric"
              type="password"
              autoFocus
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-label="Staff PIN"
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button
            className="w-full"
            type="submit"
            disabled={working || !userId}
          >
            {working
              ? "Signing in…"
              : setup
                ? "Save PIN and sign in"
                : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
