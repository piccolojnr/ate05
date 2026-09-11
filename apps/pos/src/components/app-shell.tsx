import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import type { NavigationItem } from "../data";
import type { SessionUser } from "../lib/pos-client";
import { OperationalStatus } from "./operational-status";

export function AppShell({
  active,
  onNavigate,
  children,
  session,
  onLock,
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
  businessName: string;
  databaseHealthy: boolean;
  pendingPrints: number;
  canOpenSettings: boolean;
}) {
  return (
    <main className="flex h-dvh min-h-[680px] overflow-hidden bg-background text-foreground">
      <Sidebar active={active} onNavigate={onNavigate} session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {active === "POS" ? "Sell" : active}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {businessName || "ATE05"}
            </p>
          </div>
          <OperationalStatus
            databaseHealthy={databaseHealthy}
            pendingPrints={pendingPrints}
            onOpenSettings={
              canOpenSettings ? () => onNavigate("Settings") : undefined
            }
          />
          <div className="flex shrink-0 items-center gap-3 border-l border-border pl-4">
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
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </main>
  );
}
