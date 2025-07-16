import { generateUniqueId, SESSION_ID_BYTES, TRACE_ID_BYTES } from "./id";

type TraceFlags = {
  withoutSession: boolean;
};

const TRACE_ID_PREFIX = "d042";

const TRACE_FLAGS = {
  WITHOUT_SESSION: 0x01, // 00000001 - in some edge cases we do not have a session ID, so we need to mark the trace as such
} as const;

function encodeTraceFlags(flags: TraceFlags): string {
  let byte = 0;
  if (flags.withoutSession) {
    byte |= TRACE_FLAGS.WITHOUT_SESSION;
  }

  return byte.toString(16).padStart(2, "0");
}

export function generateTraceId(sessionId: string | null): string {
  if (!sessionId) {
    return `${TRACE_ID_PREFIX}${encodeTraceFlags({ withoutSession: true })}${generateUniqueId(TRACE_ID_BYTES - 3)}`;
  }
  return `${TRACE_ID_PREFIX}${encodeTraceFlags({ withoutSession: false })}${sessionId}${generateUniqueId(TRACE_ID_BYTES - SESSION_ID_BYTES - 3)}`;
}
