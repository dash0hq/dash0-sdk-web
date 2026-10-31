import { win } from "../../utils";

const DEBUG_ID_GLOBALS = ["_sentryDebugIds", "_debugIds"];
const STACK_FRAME_URL = /(https?:\/\/[^\s)]+?):\d+:\d+/;

/**
 * Script URL to debug ID, read from the globals that bundler plugins write into each script. Later globals win,
 * as in the Sentry SDK. The keys of those globals are `new Error().stack` strings taken inside the script.
 */
export function readDebugIds(): Map<string, string> {
  const debugIdByUrl = new Map<string, string>();
  for (const name of DEBUG_ID_GLOBALS) {
    const debugIds = (win as Record<string, unknown> | undefined)?.[name];
    if (!debugIds || typeof debugIds !== "object") continue;
    for (const [stack, debugId] of Object.entries(debugIds)) {
      const url = STACK_FRAME_URL.exec(stack)?.[1];
      if (url && typeof debugId === "string") debugIdByUrl.set(url, debugId);
    }
  }
  return debugIdByUrl;
}
