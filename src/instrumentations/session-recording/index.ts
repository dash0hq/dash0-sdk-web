import { vars } from "../../vars";
import { sessionId } from "../../api/session";
import { debug, doc, generateUniqueId, isSessionSampledIn, TRACE_ID_BYTES, warn, win } from "../../utils";
import { generateTraceId } from "../../utils/trace-id";
import { generateSpanId } from "../../utils/span-id";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addEventListener } from "../../utils/listeners";
import { onLastChance } from "../../utils/on-last-chance";
import { sendSessionRecordingChunk } from "../../transport";
import { SessionRecorder, SessionRecordingEvent } from "../../types/session-recording";
import { Chunker, newChunker } from "./chunker";
import { buildSessionRecordingLog, RecordingStream } from "./log";

/**
 * Global set by `dash0-session-recording.iife.js`. Read by `armSessionRecording()` and by
 * `startSessionRecording()` when called without a recorder.
 */
export const GLOBAL_RECORDER_KEY = "dash0Recorder";

let recorder: SessionRecorder | undefined;
let armed = false;
let stopRecorder: (() => void) | undefined;
let chunker: Chunker | undefined;
let lastChanceRegistered = false;
let visibilityRegistered = false;
// Set by the public `stopSessionRecording()`, so a visibility change does not resurrect a recording the
// consumer deliberately ended. Cleared by an explicit start: registering a recorder or arming.
let stoppedByConsumer = false;
// True while flushing a document that may not live much longer. The chunk emitted then must be sent
// uncompressed: gzip is asynchronous, and a document that is being unloaded — or that has just been hidden,
// and may be unloaded or throttled at any moment — may never get to the `fetch()` behind the await.
let flushingWhileDocumentMayEnd = false;

/**
 * Makes a recorder available. Called from the public `startSessionRecording` API, which the
 * `dash0-session-recording.iife.js` script and npm consumers use. Recording starts as soon as both a recorder
 * is registered and `init()` has armed session recording, in either order.
 */
export function registerSessionRecorder(r: SessionRecorder): void {
  recorder = r;
  stoppedByConsumer = false;
  if (armed) {
    start();
  }
}

/**
 * Called from `init()` once configuration is in place and the session is sampled.
 *
 * Recorder precedence: `sessionRecording.recorder` from the init options, then a recorder registered through
 * `startSessionRecording(recorder)`, then `window.dash0Recorder`. The last one is set by
 * `dash0-session-recording.iife.js`, and is the only handover that works when that script executes before the
 * initializer snippet has defined the `dash0` command queue.
 */
export function armSessionRecording(): void {
  armed = true;
  stoppedByConsumer = false;
  if (vars.sessionRecording.recorder) {
    recorder = vars.sessionRecording.recorder;
  } else if (!recorder) {
    const globalRecorder = (win as any)?.[GLOBAL_RECORDER_KEY];
    if (typeof globalRecorder === "function") {
      recorder = globalRecorder as SessionRecorder;
    }
  }
  if (recorder) {
    start();
  }
}

export function stopSessionRecording(): void {
  stoppedByConsumer = true;
  teardown();
}

export function isSessionRecording(): boolean {
  return stopRecorder != null;
}

/**
 * Stops the recorder and flushes what it buffered. Shared by the public stop and by the visibility handler,
 * which differ only in whether the consumer asked for it.
 */
function teardown(): void {
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

/**
 * Whether the document is not on screen. Treats an absent `visibilityState` as visible, so an environment
 * without the API records exactly as it did before rather than never recording at all.
 *
 * `prerender` counts as hidden: nobody is looking at a prerendered page.
 */
function isDocumentHidden(): boolean {
  const state = doc?.visibilityState;
  return state != null && state !== "visible";
}

/**
 * Recording follows visibility: a hidden tab is torn down and a shown tab starts a new recorder run.
 *
 * This is what lets one replayer play a whole session. rrweb's Replayer rebuilds from any full snapshot it
 * plays through, but each rebuild resets its node-id mirror, so events from a document other than the one
 * that produced the newest snapshot would address the wrong nodes. Recording only the visible document keeps
 * the runs of a session from overlapping, so they concatenate into a single coherent stream. `record()` takes
 * a full snapshot when it starts, so every run opens with one and needs no separate snapshot call.
 *
 * Not recording hidden tabs is also why a session stays small: a background tab left open for hours used to
 * record mutations nobody ever saw.
 */
function registerVisibilityHandling(): void {
  if (visibilityRegistered || !doc) {
    return;
  }
  visibilityRegistered = true;
  addEventListener(doc, "visibilitychange", () => {
    if (isDocumentHidden()) {
      // Flushed the same way as an unload: a hidden document can be discarded or throttled before an
      // asynchronous gzip completes.
      flushingWhileDocumentMayEnd = true;
      try {
        teardown();
      } finally {
        flushingWhileDocumentMayEnd = false;
      }
      return;
    }
    if (!stoppedByConsumer) {
      start();
    }
  });
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

  registerVisibilityHandling();
  if (isDocumentHidden()) {
    // A tab opened in the background — ctrl+click, `target=_blank`, a restored session — must not record
    // until it is first shown. The listener above starts it then.
    debug("Document is hidden. Session recording will start once it becomes visible.");
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
        sendSessionRecordingChunk(buildSessionRecordingLog(stream, chunk), {
          compress: !flushingWhileDocumentMayEnd,
        });
      } catch (e) {
        warn("Failed to transmit session recording chunk", e);
      }
    },
  });
  chunker = c;

  try {
    stopRecorder = recorder({
      // rrweb can still emit after its stop function ran (trailing throttle timers), and a recorder that failed
      // to start may have emitted already. Only accept events while this chunker is the active one.
      emit: (event: SessionRecordingEvent) => {
        if (chunker === c) c.add(event);
      },
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
    abandonChunker(c);
    return;
  }

  if (!stopRecorder) {
    // rrweb returns undefined when it refuses to record, e.g. in an unsupported environment.
    warn("Session recorder did not start.");
    abandonChunker(c);
    return;
  }

  if (!lastChanceRegistered) {
    lastChanceRegistered = true;
    onLastChance(() => {
      flushingWhileDocumentMayEnd = true;
      try {
        chunker?.flush();
      } finally {
        flushingWhileDocumentMayEnd = false;
      }
    });
  }

  debug("Session recording started", stream);
}

/**
 * The recorder did not start, but it may already have emitted events into `c` and armed its flush timer. Drop
 * them so no chunk of a stream that never started is transmitted later.
 */
function abandonChunker(c: Chunker): void {
  c.discard();
  chunker = undefined;
}
