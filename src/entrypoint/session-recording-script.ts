/**
 * Script-tag entrypoint, built to `dist/dash0-session-recording.iife.js`.
 *
 * This bundle contains only rrweb's recorder. It must not import any SDK module (see eslint.config.js), so the
 * main SDK bundle stays the single owner of configuration, session and transport state. It hands the recorder
 * to the SDK in two ways, so it can be loaded in any order relative to the initializer snippet and `dash0.iife.js`:
 *
 * - `window.dash0Recorder`: picked up by the SDK when `init()` runs. Covers the case where this bundle executes
 *   before the initializer snippet has defined the `dash0` command queue.
 * - `dash0("startSessionRecording", record)`: covers the case where the SDK is already initialized, or the
 *   command queue exists and will be drained on `init()`.
 */
/* eslint-disable no-restricted-globals */
import { record } from "@rrweb/record";

type Dash0Global = ((...args: unknown[]) => void) | undefined;

(window as unknown as { dash0Recorder?: unknown }).dash0Recorder = record;

const dash0 = (window as unknown as { dash0?: Dash0Global }).dash0;
if (typeof dash0 === "function") {
  dash0("startSessionRecording", record);
}
