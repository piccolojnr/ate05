import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import type { NavigationItem } from "../data";
import type { SessionUser } from "../lib/pos-client";
import { OperationalStatus } from "./operational-status";
import { Icon } from "./icons";

export function AppShell({
  active,
  onNavigate,
  children,
  session,
  onLock,
  onStartNewOrder,
  businessName,
  databaseHealthy,
  pendingPrints,
  canOpenSettings,
}: {
  active: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
  children: ReactNode;
  session: SessionUser;
  onLock: () => void;
  onStartNewOrder: () => void;
  businessName: string;
  databaseHealthy: boolean;
  pendingPrints: number;
  canOpenSettings: boolean;
}) {
  return (
    <main className="flex h-dvh min-h-[680px] overflow-hidden bg-background text-foreground">
      <Sidebar active={active} onNavigate={onNavigate} session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-3 lg:px-5">
          <div className="flex min-h-14 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:px-4">
            <div className="flex min-w-[170px] flex-1 items-center gap-3">
              <span
                className="h-10 w-1 rounded-full bg-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  {businessName || "ATE05"}
                </p>
                <h1 className="truncate text-lg font-black tracking-tight">
                  {active === "POS" ? "Order entry" : active}
                </h1>
              </div>
            </div>
            <div className="order-3 flex w-full items-center gap-1.5 overflow-x-auto border-t border-border pt-2 lg:order-none lg:w-auto lg:border-t-0 lg:pt-0">
              <span className="mr-1 hidden rounded bg-muted px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground xl:inline">
                Quick actions
              </span>
              <button
                type="button"
                onClick={onStartNewOrder}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="plus" width={17} height={17} />
                {active === "POS" ? "New order" : "Start order"}
              </button>
              {session.permissions.includes("orders") ? (
                <button
                  type="button"
                  onClick={() => onNavigate("Orders")}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon name="orders" width={17} height={17} />
                  Open orders
                </button>
              ) : null}
              {session.permissions.includes("tables") ? (
                <button
                  type="button"
                  onClick={() => onNavigate("Tables")}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon name="tables" width={17} height={17} />
                  Tables
                </button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3 border-l border-border pl-3">
              <OperationalStatus
                databaseHealthy={databaseHealthy}
                pendingPrints={pendingPrints}
                onOpenSettings={
                  canOpenSettings ? () => onNavigate("Settings") : undefined
                }
              />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold">{session.name}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {session.role}
                </p>
              </div>
              <button
                type="button"
                onClick={onLock}
                className="min-h-9 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lock
              </button>
            </div>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </main>
  );
}
