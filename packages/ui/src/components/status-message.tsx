import type { ReactNode } from "react";

export interface StatusMessageProps {
  children: ReactNode;
}

/** Small composable primitive following shadcn/ui's copy-and-own style. */
export function StatusMessage({ children }: StatusMessageProps) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
