import type { PaperWidth } from "./index";

export const DEFAULT_PRINTER_DPI = 203;

export function millimetresToDots(
  millimetres: number,
  dpi = DEFAULT_PRINTER_DPI,
): number {
  if (!Number.isFinite(millimetres) || millimetres <= 0)
    throw new Error("Paper width must be greater than zero.");
  if (!Number.isFinite(dpi) || dpi <= 0)
    throw new Error("Printer DPI must be greater than zero.");
  return Math.round((millimetres / 25.4) * dpi);
}

export function dotsToMillimetres(
  dots: number,
  dpi = DEFAULT_PRINTER_DPI,
): number {
  if (!Number.isFinite(dots) || dots <= 0)
    throw new Error("Printable width must be greater than zero.");
  if (!Number.isFinite(dpi) || dpi <= 0)
    throw new Error("Printer DPI must be greater than zero.");
  return (dots * 25.4) / dpi;
}

export function printableDotsForPaperWidth(
  paperWidth: PaperWidth,
  dpi = DEFAULT_PRINTER_DPI,
): number {
  return millimetresToDots(paperWidth, dpi);
}
