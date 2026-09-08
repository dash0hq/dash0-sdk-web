import { vars } from "../../vars";
import { sessionId } from "../../api/session";
import { debug, generateUniqueId, isSessionSampledIn, TRACE_ID_BYTES, warn, win } from "../../utils";
import { generateTraceId } from "../../utils/trace-id";
import { generateSpanId } from "../../utils/span-id";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { onLastChance } from "../../utils/on-last-chance";
import { sendSessionRecordingChunk } from "../../transport";
import { SessionRecorder, SessionRecordingEvent } from "../../types/session-recording";
import { Chunker, newChunker } from "./chunker";
import { buildSessionRecordingLog, RecordingStream } from "./log";

let recorder: SessionRecorder | undefined;
let armed = false;
let stopRecorder: (() => void) | undefined;
let chunker: Chunker | undefined;
let lastChanceRegistered = false;

/**
 * Makes a recorder available. Called from the public `startSessionRecording` API, which the
 * `dash0-session-recording.iife.js` script and npm consumers use. Recording starts as soon as both a recorder
 * is registered and `init()` has armed session recording, in either order.
 */
export function registerSessionRecorder(r: SessionRecorder): void {
  recorder = r;
  if (armed) {
    start();
  }
}

/**
 * Called from `init()` once configuration is in place and the session is sampled.
 */
export function armSessionRecording(): void {
  armed = true;
  if (vars.sessionRecording.recorder) {
    recorder = vars.sessionRecording.recorder;
  }
  if (recorder) {
    start();
  }
}

export function stopSessionRecording(): void {
  if (stopRecorder) {
    try {
      stopRecorder();
    } catch (e) {
      debug("Failed to stop session recorder", e);
    }
    stopRecorder = undefined;
  }
  chunker?.flush();
  chunker = undefined;
}

export function isSessionRecording(): boolean {
  return stopRecorder != null;
}

function start(): void {
  if (stopRecorder) {
    debug("Session recording already running. Ignoring start.");
    return;
  }
  if (!recorder || !win) return;

  const settings = vars.sessionRecording;

  if (!vars.isSessionSampled) {
    debug("Session is not sampled. Session recording will not start.");
    return;
  }
  if (!isSessionSampledIn(sessionId ?? "", settings.samplingRate ?? 100)) {
    debug("Session is not sampled for recording. Session recording will not start.");
    return;
  }
  if (isUrlIgnored(win.location.href)) {
    debug("Page URL is ignored. Session recording will not start.");
    return;
  }

  const traceId = generateTraceId(sessionId);
  const stream: RecordingStream = {
    recordingId: generateUniqueId(TRACE_ID_BYTES),
    traceId,
    spanId: generateSpanId(traceId),
  };

  const c = newChunker({
    maxBytes: settings.chunkMaxBytes ?? 48000,
    maxMillis: settings.chunkMaxMillis ?? 5000,
    onChunk: (chunk) => {
      try {
        sendSessionRecordingChunk(buildSessionRecordingLog(stream, chunk));
      } catch (e) {
        warn("Failed to transmit session recording chunk", e);
      }
    },
  });
  chunker = c;

  try {
    stopRecorder = recorder({
      emit: (event: SessionRecordingEvent) => c.add(event),
      checkoutEveryNms: settings.checkoutEveryNms,
      maskAllInputs: settings.maskAllInputs,
      maskTextClass: settings.maskTextClass,
      maskTextSelector: settings.maskTextSelector,
      maskInputFn: settings.maskInputFn,
      maskTextFn: settings.maskTextFn,
      blockClass: settings.blockClass,
      blockSelector: settings.blockSelector,
      recordCanvas: settings.recordCanvas,
      collectFonts: settings.collectFonts,
    });
  } catch (e) {
    warn("Failed to start session recorder", e);
    chunker = undefined;
    return;
  }

  if (!stopRecorder) {
    // rrweb returns undefined when it refuses to record, e.g. in an unsupported environment.
    warn("Session recorder did not start.");
    chunker = undefined;
    return;
  }

  if (!lastChanceRegistered) {
    lastChanceRegistered = true;
    onLastChance(() => chunker?.flush());
  }

  debug("Session recording started", stream);
}
