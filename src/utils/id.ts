import * as localStorage from "./local-storage";

export const SPAN_ID_BYTES = 8;
export const TRACE_ID_BYTES = 16;
export const PAGE_LOAD_ID_BYTES = TRACE_ID_BYTES;
export const SESSION_ID_BYTES = SPAN_ID_BYTES;
export const TAB_ID_BYTES = SPAN_ID_BYTES;

const SHARED_CHAR_CODES_ARRAY = Array(32);
export function generateUniqueId(byteCount: number): string {
  for (let i = 0; i < byteCount * 2; i++) {
    SHARED_CHAR_CODES_ARRAY[i] = Math.floor(Math.random() * 16) + 48;
    // valid hex characters in the range 48-57 and 97-102
    if (SHARED_CHAR_CODES_ARRAY[i] >= 58) {
      SHARED_CHAR_CODES_ARRAY[i] += 39;
    }
  }
  return String.fromCharCode.apply(null, SHARED_CHAR_CODES_ARRAY.slice(0, byteCount * 2));
}

export function generateSessionId(): string {
  // if the browser does support local storage the session is tracked over multiple page loads
  const sessionFlags = localStorage.isSupported ? "00" : "01";
  return `${sessionFlags}${generateUniqueId(SESSION_ID_BYTES - 1)}`;
}

export function generateTraceId(sessionId: string | null): string {
  if (!sessionId) {
    return `D04200${generateUniqueId(TRACE_ID_BYTES - 3)}`;
  }
  return `D04200${sessionId}${generateUniqueId(TRACE_ID_BYTES - SESSION_ID_BYTES - 3)}`;
}
