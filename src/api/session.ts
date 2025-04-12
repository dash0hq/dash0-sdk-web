import { isSupported, getItem, setItem, removeItem, SESSION_ID_BYTES } from "../utils";
import { debug, generateUniqueId, now } from "../utils";
import { info, warn } from "../utils";

interface Session {
  id: string,
  startTime: number,
  lastActivityTime: number
}

const SESSION_STORAGE_KEY = 'd0_session';
const STORAGE_SEPARATOR_KEY = "#";
const DEFAULT_SESSION_INACTIVITY_TIMEOUT_MILLIS = 1000 * 60 * 60 * 3;
const DEFAULT_SESSION_TERMINATION_TIMEOUT_MILLIS = 1000 * 60 * 60 * 6;
const MAX_ALLOWED_SESSION_TIMEOUT_MILLIS = 1000 * 60 * 60 * 24;

export let sessionId: string | null = null;

export function trackSessions(sessionInactivityTimeoutMillis?: number,
                              sessionTerminationTimeoutMillis?: number): void {
  if (!isSupported) {
    debug("Storage API is not available and session tracking is therefore not supported.");
    return;
  }

  if (!sessionInactivityTimeoutMillis) {
    sessionInactivityTimeoutMillis = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MILLIS;
  }
  if (!sessionTerminationTimeoutMillis) {
    sessionTerminationTimeoutMillis = DEFAULT_SESSION_TERMINATION_TIMEOUT_MILLIS;
  }
  sessionInactivityTimeoutMillis = Math.min(sessionInactivityTimeoutMillis, MAX_ALLOWED_SESSION_TIMEOUT_MILLIS);
  sessionTerminationTimeoutMillis = Math.min(sessionTerminationTimeoutMillis, MAX_ALLOWED_SESSION_TIMEOUT_MILLIS);

  try {
    const storedValue = getItem(SESSION_STORAGE_KEY);

    let session = parseSession(storedValue);
    if (session && !isSessionValid(session, sessionInactivityTimeoutMillis, sessionTerminationTimeoutMillis)) {
      session = null;
    }

    if (session) {
      session.lastActivityTime = now();
    } else {
      session = {
        id: generateUniqueId(SESSION_ID_BYTES),
        startTime: now(),
        lastActivityTime: now(),
      };
    }

    setItem(SESSION_STORAGE_KEY, serializeSession(session));
    sessionId = session.id;
  } catch (e) {
    warn("Failed to record session information", e);
  }
}

export function terminateSession() {
  sessionId = null;

  if (!isSupported) {
    return;
  }

  try {
    removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    info("Failed to terminate session", e);
  }
}

function parseSession(storedValue?: string | null): Session | null {
  if (!storedValue) {
    return null;
  }

  const values = storedValue.split(STORAGE_SEPARATOR_KEY);
  if (values.length < 3) {
    return null;
  }

  const id = values[0];
  const startTime = parseInt(values[1]!, 10);
  const lastActivityTime = parseInt(values[2]!, 10);
  if (!id || isNaN(startTime) || isNaN(lastActivityTime)) {
    return null;
  }

  return {
    id,
    startTime,
    lastActivityTime,
  };
}

function serializeSession(session: Session): string {
  return session.id + STORAGE_SEPARATOR_KEY + session.startTime + STORAGE_SEPARATOR_KEY + session.lastActivityTime;
}

function isSessionValid(session: Session,
                        sessionInactivityTimeoutMillis: number,
                        sessionTerminationTimeoutMillis: number): boolean {

  const minAllowedLastActivityTime = now() - sessionInactivityTimeoutMillis;
  if (session.lastActivityTime < minAllowedLastActivityTime) {
    return false;
  }

  const minAllowedStartTime = now() - sessionTerminationTimeoutMillis;
  return session.startTime >= minAllowedStartTime;
}
