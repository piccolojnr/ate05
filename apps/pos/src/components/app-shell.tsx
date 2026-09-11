import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import type { NavigationItem } from "../data";
import type { SessionUser } from "../lib/pos-client";

export function AppShell({
  active,
  onNavigate,
  children,
  session,
  onLock,
}: {
  active: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
  children: ReactNode;
  session: SessionUser;
  onLock: () => void;
}) {
  return (
    <main className="flex h-dvh min-h-[680px] overflow-hidden bg-background text-foreground">
      <Sidebar
        active={active}
        onNavigate={onNavigate}
        session={session}
        onLock={onLock}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </main>
  );
}
