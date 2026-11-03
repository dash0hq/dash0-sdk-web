/**
 * Script-tag entrypoint, built to `dist/dash0-session-recording.iife.js`.
 *
 * This bundle contains only rrweb's recorder. It must not import any SDK module (see eslint.config.js), so the
 * main SDK bundle stays the single owner of configuration, session and transport state.
 *
 * Loading it does not start a recording. It only makes the recorder available to an SDK whose init options set
 * `sessionRecording: { enabled: true }`, in any order relative to the initializer snippet and `dash0.iife.js`:
 *
 * - `window.dash0SessionRecording`: read by the SDK when `init()` runs after this bundle.
 * - a `dash0:session-recorder` event on `window`: tells an SDK that was initialized before this bundle ran.
 *
 * Both names must match `GLOBAL_RECORDER_KEY` and `RECORDER_READY_EVENT` in `src/instrumentations/session-recording`.
 */
/* eslint-disable no-restricted-globals */
import { record } from "@rrweb/record";

(window as unknown as { dash0SessionRecording?: unknown }).dash0SessionRecording = { recorder: record };
window.dispatchEvent(new Event("dash0:session-recorder"));
