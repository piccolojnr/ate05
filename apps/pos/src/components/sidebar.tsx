import { cn } from "@ate05/ui";
import { navigationItems, type NavigationItem } from "../data";
import { Icon, type IconName } from "./icons";

const icons: Record<NavigationItem, IconName> = {
  POS: "pos",
  Orders: "orders",
  Tables: "tables",
  Menu: "menu",
  Inventory: "inventory",
  Settings: "settings",
};

export function Sidebar({
  active,
  onNavigate,
}: {
  active: NavigationItem;
  onNavigate: (item: NavigationItem) => void;
}) {
  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-nav-border bg-nav p-4 text-nav-foreground max-lg:w-[76px] max-lg:px-3"
      aria-label="Primary navigation"
    >
      <div className="mb-4 border-b border-nav-border px-2 pb-4">
        <span className="text-lg font-black tracking-tight">ATE 05</span>
        <p className="mt-1 text-xs text-nav-muted max-lg:hidden">
          Restaurant Management
        </p>
      </div>
      <nav className="space-y-1">
        {navigationItems.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onNavigate(item)}
            aria-current={active === item ? "page" : undefined}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition-colors",
              active === item
                ? "border-nav-active bg-nav-active text-nav-active-foreground"
                : "border-transparent text-nav-muted hover:bg-nav-hover hover:text-nav-foreground",
            )}
          >
            <Icon name={icons[item]} />
            <span className="max-lg:hidden">{item}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-md border border-nav-border bg-nav-hover p-3 max-lg:hidden">
        <p className="text-xs">Receptionist</p>
        <p className="mt-1 flex justify-between text-xs">
          <strong>Naa Adjeley</strong>
          <span className="text-success">● Online</span>
        </p>
      </div>
    </aside>
  );
}
