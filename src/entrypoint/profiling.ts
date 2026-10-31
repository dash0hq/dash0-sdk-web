/**
 * npm entrypoint of `@dash0/sdk-web/profiling`. Holds the OTLP/JSON encoder for profiles and no other
 * SDK module (see eslint.config.js), so the main SDK bundle keeps the configuration and transport state.
 */
import { encodeProfile } from "../profiling/encode";
import type { ProfileEncoder } from "../types/profiling";

/** Pass it to `init({ profiling: { encoder } })`. */
export const encoder: ProfileEncoder = encodeProfile;
