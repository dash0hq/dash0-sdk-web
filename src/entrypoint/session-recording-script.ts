/**
 * Script-tag entrypoint, built to `dist/dash0-session-recording.iife.js`.
 *
 * This bundle contains only rrweb's recorder. It must not import any SDK module (see eslint.config.js), so the
 * main SDK bundle stays the single owner of configuration, session and transport state. It hands the recorder
 * to the SDK through the `dash0(...)` command queue, so it can be loaded before or after `dash0.iife.js`, as long
 * as the initializer snippet has run.
 */
/* eslint-disable no-restricted-globals */
import { record } from "@rrweb/record";

type Dash0Global = ((...args: unknown[]) => void) | undefined;

const dash0 = (window as unknown as { dash0?: Dash0Global }).dash0;
(window as unknown as { dash0Recorder?: unknown }).dash0Recorder = record;

if (typeof dash0 === "function") {
  dash0("startSessionRecording", record);
} else if (typeof console !== "undefined") {
  console.warn(
    "Dash0 Web SDK: global 'dash0' not found. Load the initializer snippet before dash0-session-recording.iife.js."
  );
}
