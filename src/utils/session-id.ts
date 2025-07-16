import * as localStorage from "./local-storage";
import { generateUniqueId, SESSION_ID_BYTES } from "./id";

type SessionFlags = {
  ephemeralSession: boolean;
};

const SESSION_FLAGS = {
  EPHEMERAL_SESSION: 0x01, // 00000001 - if the browser does NOT support local storage we count the session as ephemeral because we cannot persist it
} as const;

function encodeSessionFlags(flags: SessionFlags): string {
  let byte = 0;
  if (flags.ephemeralSession) {
    byte |= SESSION_FLAGS.EPHEMERAL_SESSION;
  }

  return byte.toString(16).padStart(2, "0");
}

export function generateSessionId(): string {
  const sessionFlags = {
    ephemeralSession: !localStorage.isSupported,
  };

  return `${encodeSessionFlags(sessionFlags)}${generateUniqueId(SESSION_ID_BYTES - 1)}`;
}
