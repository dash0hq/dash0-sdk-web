import { generateUniqueId, SPAN_ID_BYTES } from "./id";
import { crc32 } from "./crc32";

export function generateSpanId(traceId: string): string {
  const checksum = crc32(traceId);
  const prefix = checksum.toString(16).padStart(8, "0");

  return `${prefix}${generateUniqueId(SPAN_ID_BYTES - 4)}`;
}
