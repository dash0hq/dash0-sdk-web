import { debug, win } from "../utils";
import { SessionRecorder } from "../types/session-recording";
import {
  GLOBAL_RECORDER_KEY,
  registerSessionRecorder,
  stopSessionRecording as stopRecording,
} from "../instrumentations/session-recording";

/**
 * Starts session recording with the given recorder. Pass `recorder` from `@dash0/sdk-web/session-recording`.
 * When `recorder` is omitted, the SDK looks for `window.dash0Recorder`, which the
 * `dash0-session-recording.iife.js` script sets. Calling this is not required when that script is used: `init()`
 * picks up `window.dash0Recorder` on its own, regardless of the order in which the scripts execute.
 *
 * Recording only starts once `init()` has run with a sampled session. It is safe to call this before `init()`;
 * the recorder is kept and recording starts as soon as the SDK is initialized. The recording is transmitted
 * as `browser.session_recording` log records that share one trace ID, which embeds the session ID.
 *
 * Only the visible document is recorded. A tab that is hidden — switched away from, or opened in the
 * background — stops recording and flushes what it buffered, and starts a fresh recording when it is shown
 * again. So a session is a sequence of recordings that do not overlap in time, which is what lets the whole
 * session, tab switches included, be replayed as one.
 */
export function startSessionRecording(recorder?: SessionRecorder): void {
  // The script entrypoint forwards dash0("startSessionRecording", ...) arguments without type checking,
  // so malformed calls must degrade to a logged no-op instead of throwing. An uncaught throw here would
  // abort the command-queue drain and drop all subsequently queued api calls.
  const r = recorder ?? (win as any)?.[GLOBAL_RECORDER_KEY];
  if (typeof r !== "function") {
    debug(
      "startSessionRecording requires a recorder. Import `recorder` from `@dash0/sdk-web/session-recording` or load dash0-session-recording.iife.js. Ignoring call."
    );
    return;
  }

  registerSessionRecorder(r as SessionRecorder);
}

/**
 * Stops the running session recording and transmits any buffered events. Calling this when no recording is
 * running is a no-op.
 *
 * Unlike the automatic pause while a tab is hidden, this is final: recording does not resume when the tab
 * becomes visible again. Call `startSessionRecording()` to record again.
 */
export function stopSessionRecording(): void {
  stopRecording();
}
