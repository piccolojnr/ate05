import type { SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
