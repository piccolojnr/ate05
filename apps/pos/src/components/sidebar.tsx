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
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-[#252525] bg-[#111] p-4 text-[#f9f7f2] max-lg:w-[76px] max-lg:px-3"
      aria-label="Primary navigation"
    >
      <div className="mb-4 border-b border-[#2d2d2d] px-2 pb-4">
        <span className="text-lg font-black tracking-tight">ATE 05</span>
        <p className="mt-1 text-xs text-[#c9c9c9] max-lg:hidden">
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
                ? "border-primary bg-primary text-white"
                : "border-[#2f2f2f] text-[#ececec] hover:bg-[#1b1b1b]",
            )}
          >
            <Icon name={icons[item]} />
            <span className="max-lg:hidden">{item}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-md border border-[#2d2d2d] bg-[#1b1b1b] p-3 max-lg:hidden">
        <p className="text-xs">Receptionist</p>
        <p className="mt-1 flex justify-between text-xs">
          <strong>Naa Adjeley</strong>
          <span className="text-emerald-400">● Online</span>
        </p>
      </div>
    </aside>
  );
}
