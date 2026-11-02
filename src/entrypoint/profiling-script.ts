/**
 * Script-tag entrypoint, built to `dist/dash0-profiling.iife.js`. Like `dash0-session-recording.iife.js`, it hands
 * the encoder over in two ways, so it can be loaded in any order relative to the initializer snippet and
 * `dash0.iife.js`: `window.dash0ProfileEncoder`, read by `init()`, and `dash0("registerProfileEncoder", ...)`.
 */
/* eslint-disable no-restricted-globals */
import { encodeProfiles } from "../profiling/encode";

type Dash0Global = ((...args: unknown[]) => void) | undefined;

(window as unknown as { dash0ProfileEncoder?: unknown }).dash0ProfileEncoder = encodeProfiles;

const dash0 = (window as unknown as { dash0?: Dash0Global }).dash0;
if (typeof dash0 === "function") {
  dash0("registerProfileEncoder", encodeProfiles);
}
