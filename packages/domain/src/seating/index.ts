export const tableStatuses = ["available", "occupied", "reserved"] as const;
export type TableStatus = (typeof tableStatuses)[number];
