import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input } from "@ate05/ui";
import type { AuthBootstrap, AuthUser, SessionUser } from "../lib/pos-client";
import { PosClientError } from "../lib/client-errors";

type AuthMode = "returning" | "select" | "pin";

export function AuthScreen({
  bootstrap,
  rememberedStaffId,
  onForgetRemembered,
  onLogin,
  onSetupPin,
}: {
  bootstrap: AuthBootstrap;
  rememberedStaffId: string | null;
  onForgetRemembered: () => Promise<void>;
  onLogin: (userId: string, pin: string) => Promise<SessionUser>;
  onSetupPin: (userId: string, pin: string) => Promise<void>;
}) {
  const activeStaff = useMemo(
    () => bootstrap.users.filter((user) => user.active && user.hasPin),
    [bootstrap.users],
  );
  const rememberedUser = activeStaff.find(
    (user) => user.id === rememberedStaffId,
  );
  const owner = bootstrap.users.find(
    (user) => user.role === "owner" && user.active,
  );
  const setupUser = owner ?? bootstrap.users[0];
  const setup = bootstrap.requiresOwnerPin;
  const [mode, setMode] = useState<AuthMode>(
    setup ? "pin" : rememberedUser ? "returning" : "select",
  );
  const [selectedUserId, setSelectedUserId] = useState(
    setup ? (setupUser?.id ?? "") : (rememberedUser?.id ?? ""),
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (mode === "returning" || mode === "pin") {
      document
        .querySelector<HTMLInputElement>('input[aria-label="Staff PIN"]')
        ?.focus();
    }
  }, [mode]);

  const selectedUser = activeStaff.find((user) => user.id === selectedUserId);
  const pinUser: AuthUser | undefined = setup ? setupUser : selectedUser;

  function chooseUser(userId: string) {
    setSelectedUserId(userId);
    setPin("");
    setError("");
    setMode("pin");
  }

  function switchStaff() {
    setPin("");
    setError("");
    setSelectedUserId("");
    setMode("select");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working || !pinUser) return;
    setError("");
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4 to 6 digits.");
      return;
    }
    setWorking(true);
    try {
      if (setup) await onSetupPin(pinUser.id, pin);
      await onLogin(pinUser.id, pin);
      setPin("");
    } catch (cause) {
      setPin("");
      if (cause instanceof PosClientError && cause.code === "inactive_staff") {
        await onForgetRemembered();
        setSelectedUserId("");
        setMode("select");
        setError("This staff account is no longer active.");
      } else {
        setMode("pin");
        setError(cause instanceof Error ? cause.message : "Unable to sign in.");
      }
      window.setTimeout(
        () =>
          document
            .querySelector<HTMLInputElement>('input[aria-label="Staff PIN"]')
            ?.focus(),
        0,
      );
    } finally {
      setWorking(false);
    }
  }

  if (!setup && activeStaff.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
        <Card className="w-full max-w-md p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            ATE05 POS
          </p>
          <h1 className="mt-2 text-2xl font-black">
            No staff accounts available
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An active staff account with a PIN is required before anyone can
            unlock this terminal.
          </p>
        </Card>
      </main>
    );
  }

  const showingSelection = !setup && mode === "select";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-md p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          ATE05 POS
        </p>
        <h1 className="mt-2 text-2xl font-black">
          {setup
            ? "Set up owner PIN"
            : showingSelection
              ? "Sign in to continue"
              : mode === "returning"
                ? "Welcome back"
                : "Enter your PIN"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setup
            ? "Create the first secure PIN for the restaurant owner."
            : showingSelection
              ? "Select your staff account to continue."
              : `${pinUser?.name ?? "Staff member"}${pinUser?.role ? ` · ${pinUser.role}` : ""}`}
        </p>

        {showingSelection ? (
          <div className="mt-6 space-y-2" aria-label="Staff members">
            {activeStaff.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex min-h-14 w-full items-center justify-between rounded-md border border-border px-4 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => chooseUser(user.id)}
              >
                <span className="font-semibold">{user.name}</span>
                <span className="text-sm text-muted-foreground">
                  {user.role}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => void submit(event)}
          >
            {!setup ? (
              <p
                className="rounded-md bg-muted px-3 py-2 text-sm font-semibold"
                aria-label="Selected staff member"
              >
                {pinUser?.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {pinUser?.role}
                </span>
              </p>
            ) : null}
            <label className="block text-sm font-semibold">
              PIN
              <Input
                className="mt-1 text-center text-xl tracking-[0.35em]"
                inputMode="numeric"
                type="password"
                autoComplete="off"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                aria-label="Staff PIN"
                disabled={working}
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
              disabled={working || !pinUser}
            >
              {working
                ? "Checking PIN…"
                : setup
                  ? "Save PIN and sign in"
                  : mode === "returning"
                    ? "Unlock"
                    : "Sign in"}
            </Button>
            {!setup ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={switchStaff}
                disabled={working}
              >
                {mode === "returning"
                  ? "Switch staff"
                  : "Back to staff selection"}
              </Button>
            ) : null}
          </form>
        )}
      </Card>
    </main>
  );
}
