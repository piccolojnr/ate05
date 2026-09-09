import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Shared shadcn-style Sonner surface, themed with ATE05 semantic tokens. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      closeButton
      duration={5000}
      visibleToasts={3}
      style={
        {
          "--normal-bg": "rgb(var(--card))",
          "--normal-text": "rgb(var(--card-foreground))",
          "--normal-border": "rgb(var(--border))",
          "--border-radius": "var(--radius-lg)",
          "--width": "360px",
          "--offset-right": "20px",
          "--offset-bottom": "20px",
          "--gap": "10px",
          fontFamily: "inherit",
        } as CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          toast:
            "!w-[360px] !rounded-xl !border !border-border !bg-card !px-4 !py-3 !text-card-foreground !shadow-floating",
          title: "!pr-7 !text-sm !font-semibold !leading-5",
          description: "!mt-0.5 !text-xs !leading-5 !text-muted-foreground",
          success: "!border-success/40",
          error: "!border-destructive/40",
          warning: "!border-warning/40",
          info: "!border-info/40",
          closeButton:
            "!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0 !rounded-md !border-0 !bg-transparent !text-muted-foreground hover:!bg-muted hover:!text-foreground focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-ring",
        },
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";
