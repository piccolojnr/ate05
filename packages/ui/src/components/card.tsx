import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-card",
        className,
      )}
      {...props}
    />
  );
}
