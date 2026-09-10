import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({
  className,
  type = "checkbox",
  ...props
}: CheckboxProps) {
  return (
    <input
      {...props}
      type={type}
      className={cn(
        "size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
