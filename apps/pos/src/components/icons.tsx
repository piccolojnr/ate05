import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "pos"
  | "orders"
  | "tables"
  | "kitchen"
  | "menu"
  | "inventory"
  | "settings"
  | "search"
  | "plus"
  | "minus"
  | "arrow"
  | "more";

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, ReactElement> = {
    pos: (
      <>
        <path {...common} d="M4 5h16v14H4z" />
        <path {...common} d="M7 9h3M13 9h4M7 13h10" />
      </>
    ),
    orders: (
      <>
        <path {...common} d="M7 3h10v18H7z" />
        <path {...common} d="M10 3v3h4V3M10 10h4M10 14h4" />
      </>
    ),
    tables: (
      <>
        <path {...common} d="M5 5h14v6H5zM8 11v8M16 11v8M4 19h16" />
      </>
    ),
    kitchen: (
      <>
        <path {...common} d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h8" />
        <path {...common} d="M16 12h.01" />
      </>
    ),
    menu: (
      <>
        <path {...common} d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </>
    ),
    inventory: (
      <>
        <path {...common} d="M4 8 12 4l8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8" />
      </>
    ),
    settings: (
      <>
        <circle {...common} cx="12" cy="12" r="3" />
        <path
          {...common}
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6.6 17l.1-.1A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.5-1H5.3v-3h.2A1.7 1.7 0 0 0 7 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z"
        />
      </>
    ),
    search: (
      <>
        <circle {...common} cx="11" cy="11" r="6" />
        <path {...common} d="m16 16 4 4" />
      </>
    ),
    plus: <path {...common} d="M12 5v14M5 12h14" />,
    minus: <path {...common} d="M5 12h14" />,
    arrow: <path {...common} d="M5 12h14m-6-6 6 6-6 6" />,
    more: (
      <>
        <circle fill="currentColor" cx="5" cy="12" r="1.4" />
        <circle fill="currentColor" cx="12" cy="12" r="1.4" />
        <circle fill="currentColor" cx="19" cy="12" r="1.4" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
