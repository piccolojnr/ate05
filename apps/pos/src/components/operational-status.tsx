import { cn } from "@ate05/ui";

export function OperationalStatus({
  databaseHealthy,
  pendingPrints,
  onOpenSettings,
}: {
  databaseHealthy: boolean;
  pendingPrints: number;
  onOpenSettings?: () => void;
}) {
  const hasWarning = !databaseHealthy || pendingPrints > 0;
  return (
    <div className="ml-auto flex min-w-0 items-center gap-2 text-xs">
      <span className="hidden text-muted-foreground md:inline">Local mode</span>
      {hasWarning ? (
        <button
          type="button"
          onClick={onOpenSettings}
          disabled={!onOpenSettings}
          className={cn(
            "max-w-[220px] truncate rounded-md px-2.5 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            databaseHealthy
              ? "bg-warning/15 text-warning hover:bg-warning/20"
              : "bg-destructive/10 text-destructive hover:bg-destructive/15",
            !onOpenSettings && "cursor-default",
          )}
          aria-label="Open operational issues"
        >
          {databaseHealthy
            ? `${pendingPrints} print issue${pendingPrints === 1 ? "" : "s"}`
            : "Database needs attention"}
        </button>
      ) : null}
    </div>
  );
}
