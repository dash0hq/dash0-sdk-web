/**
 * Script-tag entrypoint, built to `dist/dash0-profiling.iife.js`. Must run before `init()`, which reads
 * `window.dash0ProfileEncoder` once.
 */
/* eslint-disable no-restricted-globals */
import { encodeProfile } from "../profiling/encode";

(window as unknown as { dash0ProfileEncoder?: unknown }).dash0ProfileEncoder = encodeProfile;
