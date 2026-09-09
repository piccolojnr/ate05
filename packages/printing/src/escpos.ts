const ESC = 0x1b;
const GS = 0x1d;

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Encodes plain kitchen text using portable ESC/POS commands. */
export function encodeEscPos(text: string, cutterEnabled = true): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [
    Uint8Array.from([ESC, 0x40]),
    Uint8Array.from([ESC, 0x61, 0x00]),
  ];
  for (const rawLine of text.split("\n")) {
    const isEmphasis =
      rawLine.includes("KITCHEN ORDER") ||
      rawLine.includes("INITIAL") ||
      rawLine.includes("ADDITION") ||
      rawLine.includes("CANCELLATION") ||
      rawLine.startsWith("ORDER ");
    if (isEmphasis) parts.push(Uint8Array.from([ESC, 0x45, 0x01]));
    parts.push(encoder.encode(`${rawLine}\n`));
    if (isEmphasis) parts.push(Uint8Array.from([ESC, 0x45, 0x00]));
  }
  parts.push(Uint8Array.from([ESC, 0x64, 0x03]));
  if (cutterEnabled) parts.push(Uint8Array.from([GS, 0x56, 0x00]));
  return concat(parts);
}
