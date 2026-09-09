import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import type { NavigationItem } from "../data";

export function AppShell({
  active,
  onNavigate,
  children,
}: {
  active: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
  children: ReactNode;
}) {
  return (
    <main className="flex h-dvh min-h-[680px] overflow-hidden bg-background text-foreground">
      <Sidebar active={active} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </main>
  );
}
