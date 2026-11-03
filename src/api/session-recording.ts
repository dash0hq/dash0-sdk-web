import { restartSessionRecording, stopSessionRecording as stopRecording } from "../instrumentations/session-recording";

/**
 * Records again after `stopSessionRecording()`. Session recording is enabled in the init options only, through
 * `sessionRecording.recorder` or `sessionRecording.enabled`; this function never enables it. Calls made when
 * `init()` did not enable session recording are ignored. Recording starts on its own after `init()`, so this
 * only needs to be called after a `stopSessionRecording()`.
 *
 * The recording is transmitted as `browser.session_recording` log records that share one trace ID, which embeds
 * the session ID.
 *
 * Only the visible document is transmitted. A tab opened in the background starts recording when it is first
 * shown. A tab that is hidden flushes what it buffered and holds back whatever changes while it is hidden. When
 * it is shown again, it continues the same recording if no other tab of the session was shown in the meantime,
 * and otherwise starts a fresh recording with a new full snapshot. So a session is a sequence of recordings that
 * do not overlap in time, which is what lets the whole session, tab switches included, be replayed as one.
 */
export function startSessionRecording(): void {
  restartSessionRecording();
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
