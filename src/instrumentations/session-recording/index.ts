import { vars } from "../../vars";
import { sessionId } from "../../api/session";
import { debug, doc, generateUniqueId, isSessionSampledIn, TRACE_ID_BYTES, warn, win } from "../../utils";
import * as localStorage from "../../utils/local-storage";
import { setTimeout } from "../../utils/timers";
import { generateTraceId } from "../../utils/trace-id";
import { generateSpanId } from "../../utils/span-id";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addEventListener } from "../../utils/listeners";
import { onLastChance } from "../../utils/on-last-chance";
import { sendSessionRecordingChunk } from "../../transport";
import { SessionRecorder, SessionRecordingEvent } from "../../types/session-recording";
import { Chunker, newChunker, RRWEB_EVENT_TYPE_META } from "./chunker";
import { buildSessionRecordingLog, RecordingStream } from "./log";

/**
 * Global set by `dash0-session-recording.iife.js`. Read by `armSessionRecording()` and by
 * `startSessionRecording()` when called without a recorder.
 */
export const GLOBAL_RECORDER_KEY = "dash0Recorder";

/**
 * The recording id of the run that was shown last, shared by all tabs of the origin. A tab that is shown again
 * compares it to its own run to learn whether another tab's run was shown in the meantime.
 */
export const SHOWN_RECORDING_STORAGE_KEY = "d0_rec_shown";

/**
 * Serialized size up to which a hidden document holds the events its recorder emits. Past it the recorder stops,
 * and the document takes a full snapshot when it is shown again: a long task for the returning user, traded for
 * the memory of a background tab that keeps changing.
 */
export const HIDDEN_EVENTS_MAX_BYTES = 1_000_000;

type HiddenEvents = {
  events: { event: SessionRecordingEvent; json: string }[];
  bytes: number;
  overflowed: boolean;
};

let recorder: SessionRecorder | undefined;
let armed = false;
// The recorder that is running, which is not necessarily `recorder`: a recorder registered while one runs only
// takes over at the next start.
let runningRecorder: SessionRecorder | undefined;
let stopRecorder: (() => void) | undefined;
// Incremented whenever a recorder stops or fails to start, so whatever it still emits afterwards is dropped.
let recorderGeneration = 0;
let chunker: Chunker | undefined;
let stream: RecordingStream | undefined;
// Set while the document is hidden and its recorder keeps running. Holds what the recorder emits until the
// document is shown again.
let hiddenEvents: HiddenEvents | undefined;
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
  return stopRecorder != null && hiddenEvents == null;
}

/**
 * The id of the recording currently being captured, if any. Other instrumentations attach it to
 * their signals so a replay can be opened at the moment the signal was produced. Undefined
 * whenever no recording is running — the recorder was never provided, the session was not sampled
 * for recording, or the document is hidden.
 */
export function activeRecordingId(): string | undefined {
  return isSessionRecording() ? stream?.recordingId : undefined;
}

type RecordingStateListener = (recordingId: string | undefined) => void;

const recordingStateListeners: RecordingStateListener[] = [];

/**
 * Subscribes to the recording lifecycle: the listener is called with a recording id when a
 * recording starts, and with `undefined` when it stops. Both happen repeatedly over a session,
 * because recording follows document visibility. A document that is shown again may continue the
 * recording it had before it was hidden, and then reports that recording's id again.
 *
 * This is how instrumentations that only make sense alongside a replay — currently frustration
 * signal detection — know when to observe and when to stay out of the way. Subscribing while a
 * recording is already running calls the listener immediately, so registration order does not
 * matter.
 */
export function onRecordingStateChange(listener: RecordingStateListener): void {
  recordingStateListeners.push(listener);
  const active = activeRecordingId();
  if (active) {
    invokeRecordingStateListener(listener, active);
  }
}

function notifyRecordingState(recordingId: string | undefined): void {
  for (let i = 0; i < recordingStateListeners.length; i++) {
    invokeRecordingStateListener(recordingStateListeners[i]!, recordingId);
  }
}

function invokeRecordingStateListener(listener: RecordingStateListener, recordingId: string | undefined): void {
  try {
    listener(recordingId);
  } catch (e) {
    // A misbehaving subscriber must never take the recording down with it.
    debug("Recording state listener failed", e);
  }
}

/**
 * Stops the recorder and flushes what it buffered. Events held while the document was hidden are dropped: they
 * were never on screen.
 */
function teardown(): void {
  const wasRecording = isSessionRecording();

  stopRunningRecorder();
  hiddenEvents = undefined;

  // Before the chunk flush below, so whatever a subscriber emits on its way out is queued for the
  // same transmission rather than the next one — a teardown is often the last thing a document does.
  if (wasRecording) {
    notifyRecordingState(undefined);
  }

  chunker?.flush();
  chunker = undefined;
  stream = undefined;
}

function stopRunningRecorder(): void {
  recorderGeneration++;
  if (stopRecorder) {
    try {
      stopRecorder();
    } catch (e) {
      debug("Failed to stop session recorder", e);
    }
    stopRecorder = undefined;
  }
  runningRecorder = undefined;
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
 * Recording follows visibility, which is what lets one replayer play a whole session. rrweb's Replayer rebuilds from
 * any full snapshot it plays through, but each rebuild resets its node-id mirror, so events from a document other
 * than the one that produced the newest snapshot would address the wrong nodes. Transmitting only what the visible
 * document records keeps the runs of a session from overlapping, so they concatenate into a single coherent stream.
 *
 * A hidden document keeps its recorder running and holds back what it emits. When it is shown again and no other
 * run was shown in the meantime, the replay still shows this document, so the held events continue the same run
 * and no new full snapshot is taken — serializing the whole document is a long task the returning user would
 * otherwise feel. When another run was shown, the held events no longer match the replay and a new run opens with
 * a full snapshot instead.
 *
 * A background tab never transmits what it recorded while hidden unless it is shown again, which is what keeps a
 * session small when a tab is left open for hours.
 */
function registerVisibilityHandling(): void {
  if (visibilityRegistered || !doc) {
    return;
  }
  visibilityRegistered = true;
  addEventListener(doc, "visibilitychange", () => {
    if (isDocumentHidden()) {
      pause();
      return;
    }
    if (stoppedByConsumer) {
      return;
    }
    if (hiddenEvents) {
      resume();
    } else {
      start();
    }
  });
}

function pause(): void {
  if (!isSessionRecording()) {
    return;
  }

  notifyRecordingState(undefined);

  // Flushed the same way as an unload: a hidden document can be discarded or throttled before an
  // asynchronous gzip completes.
  flushingWhileDocumentMayEnd = true;
  try {
    chunker?.flush();
  } finally {
    flushingWhileDocumentMayEnd = false;
  }

  hiddenEvents = { events: [], bytes: 0, overflowed: false };
  debug("Document is hidden. Session recording is paused.");
}

function resume(): void {
  const held = hiddenEvents;
  hiddenEvents = undefined;
  if (!held) {
    start();
    return;
  }

  if (held.overflowed || !stream || !chunker || !wasShownLast(stream.recordingId)) {
    startRunWithSnapshot();
    return;
  }

  for (let i = 0; i < held.events.length; i++) {
    chunker.add(held.events[i]!.event, held.events[i]!.json);
  }
  debug("Session recording resumed", stream);
  notifyRecordingState(stream.recordingId);
}

/**
 * Opens a new run with a full snapshot from the running recorder, without the cost of stopping and restarting it.
 * Falls back to a restart, which takes the snapshot as it starts, when the recorder cannot snapshot on demand.
 */
function startRunWithSnapshot(): void {
  const r = runningRecorder;
  chunker?.discard();
  chunker = undefined;
  stream = undefined;

  if (!r?.takeFullSnapshot) {
    stopRunningRecorder();
    start();
    return;
  }

  const s = beginRun();
  try {
    r.takeFullSnapshot();
  } catch (e) {
    warn("Failed to take a full session recording snapshot", e);
    abandonRun();
    stopRunningRecorder();
    start();
    return;
  }

  markShown(s.recordingId);
  debug("Session recording started a new run", s);
  notifyRecordingState(s.recordingId);
}

function onRecorderEvent(event: SessionRecordingEvent): void {
  if (hiddenEvents) {
    holdWhileHidden(hiddenEvents, event);
    return;
  }
  chunker?.add(event);
}

function holdWhileHidden(held: HiddenEvents, event: SessionRecordingEvent): void {
  if (held.overflowed) {
    return;
  }

  // A checkout (see `checkoutEveryNms`) opens with a Meta event, and the full snapshot that follows it makes
  // everything held before it redundant.
  if (event.type === RRWEB_EVENT_TYPE_META) {
    held.events = [];
    held.bytes = 0;
  }

  const json = JSON.stringify(event);
  if (json == null) {
    return;
  }

  held.bytes += json.length;
  if (held.bytes > HIDDEN_EVENTS_MAX_BYTES) {
    held.overflowed = true;
    held.events = [];
    // Deferred because this runs inside the recorder's emit callback, which must not tear the recorder down.
    setTimeout(() => {
      if (hiddenEvents === held) {
        stopWhileHidden();
      }
    }, 0);
    return;
  }

  held.events.push({ event, json });
}

function stopWhileHidden(): void {
  stopRunningRecorder();
  hiddenEvents = undefined;
  chunker?.discard();
  chunker = undefined;
  stream = undefined;
  debug("Too much changed while the document was hidden. Session recording will restart once it becomes visible.");
}

function markShown(recordingId: string): void {
  try {
    localStorage.setItem(SHOWN_RECORDING_STORAGE_KEY, recordingId);
  } catch (e) {
    debug("Failed to store the shown session recording", e);
    // A stale value could let another tab believe it was shown last. Without a value, every tab takes a snapshot.
    try {
      localStorage.removeItem(SHOWN_RECORDING_STORAGE_KEY);
    } catch (e2) {
      debug("Failed to clear the shown session recording", e2);
    }
  }
}

function wasShownLast(recordingId: string): boolean {
  try {
    return localStorage.getItem(SHOWN_RECORDING_STORAGE_KEY) === recordingId;
  } catch (e) {
    debug("Failed to read the shown session recording", e);
    return false;
  }
}

function beginRun(): RecordingStream {
  const settings = vars.sessionRecording;
  const traceId = generateTraceId(sessionId);
  const s: RecordingStream = {
    recordingId: generateUniqueId(TRACE_ID_BYTES),
    traceId,
    spanId: generateSpanId(traceId),
  };
  stream = s;

  chunker = newChunker({
    maxBytes: settings.chunkMaxBytes ?? 48000,
    maxMillis: settings.chunkMaxMillis ?? 5000,
    onChunk: (chunk) => {
      try {
        sendSessionRecordingChunk(buildSessionRecordingLog(s, chunk), {
          compress: !flushingWhileDocumentMayEnd,
        });
      } catch (e) {
        warn("Failed to transmit session recording chunk", e);
      }
    },
  });

  return s;
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

  const s = beginRun();
  const r = recorder;
  const generation = ++recorderGeneration;

  try {
    stopRecorder = r({
      // rrweb can still emit after its stop function ran (trailing throttle timers), and a recorder that failed
      // to start may have emitted already. Only accept events while this recorder is the active one.
      emit: (event: SessionRecordingEvent) => {
        if (generation === recorderGeneration) onRecorderEvent(event);
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
    abandonRun();
    return;
  }

  if (!stopRecorder) {
    // rrweb returns undefined when it refuses to record, e.g. in an unsupported environment.
    warn("Session recorder did not start.");
    abandonRun();
    return;
  }
  runningRecorder = r;

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

  markShown(s.recordingId);
  debug("Session recording started", s);
  notifyRecordingState(s.recordingId);
}

/**
 * The run did not start, but its recorder may already have emitted events into the chunker and armed its flush
 * timer. Drop them so no chunk of a stream that never started is transmitted later.
 */
function abandonRun(): void {
  recorderGeneration++;
  chunker?.discard();
  chunker = undefined;
  stream = undefined;
}
