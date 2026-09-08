/**
 * npm entrypoint of `@dash0/sdk-web/session-recording`.
 *
 * This bundle contains only rrweb's recorder. It must not import any SDK module (see eslint.config.js), so the
 * main SDK bundle stays the single owner of configuration, session and transport state.
 */
import { record } from "@rrweb/record";
import type { SessionRecorder } from "../types/session-recording";

/**
 * The rrweb recorder. Pass it to `init({ sessionRecording: { recorder } })` or to `startSessionRecording(recorder)`.
 */
export const recorder = record as unknown as SessionRecorder;
