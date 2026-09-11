import { cn } from "@ate05/ui";
import { navigationItems, type NavigationItem } from "../data";
import { Icon, type IconName } from "./icons";
import type { SessionUser } from "../lib/pos-client";

const icons: Record<NavigationItem, IconName> = {
  POS: "pos",
  Orders: "orders",
  Tables: "tables",
  Kitchen: "kitchen",
  Menu: "menu",
  Inventory: "inventory",
  Settings: "settings",
};

export function Sidebar({
  active,
  onNavigate,
  session,
}: {
  active: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
  session: SessionUser;
}) {
  const allowed = new Set(session.permissions);
  return (
    <aside
      className="flex h-full w-[196px] shrink-0 flex-col border-r border-nav-border bg-nav p-3 text-nav-foreground"
      aria-label="Primary navigation"
    >
      <div className="mb-4 border-b border-nav-border px-2 pb-4">
        <span className="text-lg font-black tracking-tight">ATE 05</span>
        <p className="mt-1 text-xs text-nav-muted">Restaurant POS</p>
      </div>
      <nav className="space-y-1">
        {navigationItems
          .filter((item) => allowed.has(item.toLowerCase()))
          .map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onNavigate(item)}
              aria-current={active === item ? "page" : undefined}
              aria-label={item}
              title={item}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition-colors active:translate-y-px",
                active === item
                  ? "border-nav-active bg-nav-active text-nav-active-foreground"
                  : "border-transparent text-nav-muted hover:bg-nav-hover hover:text-nav-foreground",
              )}
            >
              <Icon name={icons[item]} />
              <span>{item === "POS" ? "Sell" : item}</span>
            </button>
          ))}
      </nav>
      <div className="mt-auto rounded-md border border-nav-border bg-nav-hover p-3">
        <p className="text-xs capitalize text-nav-muted">{session.role}</p>
        <p className="mt-1 truncate text-xs">
          <strong>{session.name}</strong>
        </p>
      </div>
    </aside>
  );
}
