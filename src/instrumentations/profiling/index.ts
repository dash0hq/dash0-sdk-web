import { vars } from "../../vars";
import { sessionId } from "../../api/session";
import { debug, doc, isSessionSampledIn, nowNanos, perf, warn, win } from "../../utils";
import { generateUniqueId, TRACE_ID_BYTES } from "../../utils/id";
import { setTimeout, clearTimeout } from "../../utils/timers";
import { addEventListener } from "../../utils/listeners";
import { LAST_CHANCE_PRIORITY_LARGE_PAYLOAD, onLastChance } from "../../utils/on-last-chance";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addAttribute } from "../../utils/otel";
import { scrubUrl } from "../../attributes/url";
import { addCommonAttributes } from "../../attributes";
import { sendLog, sendProfile } from "../../transport";
import { EVENT_NAME, EVENT_NAMES } from "../../semantic-conventions";
import { onPageView } from "../navigation/event";
import { readDebugIds } from "./debug-ids";
import { KeyValue } from "../../types/otlp";
import { ProfileChunk, ProfileEncoder, ProfilerTrace } from "../../types/profiling";

/** Global set by `dash0-profiling.iife.js`. */
export const GLOBAL_PROFILE_ENCODER_KEY = "dash0ProfileEncoder";

type UnavailableReason = "api_missing" | "document_policy" | "start_failed";

type JsProfiler = {
  readonly sampleInterval: number;
  stop(): Promise<ProfilerTrace>;
};
type JsProfilerConstructor = new (opts: { sampleInterval: number; maxBufferSize: number }) => JsProfiler;

type Running = { profiler: JsProfiler; startTime: number; url: string };
type Stopped = { trace: ProfilerTrace; chunk: Running; endTime: number };
type IdleScheduler = (callback: () => void, opts: { timeout: number }) => number;

// Encoding a chunk takes up to 10 ms on a slow CPU, so it waits for idle time; the timeout keeps a busy page
// from holding chunks back for long.
const IDLE_ENCODE_TIMEOUT_MS = 2000;
// A floor for a misconfigured length: every chunk restarts the profiler.
const MIN_CHUNK_DURATION_MS = 1000;
// One request every 5 s at most stays inside the transport's limits of 4 per 10 s and 120 per 10 min, so a burst of
// page views is batched into one request instead of being dropped.
const MIN_SEND_INTERVAL_MS = 5000;

let encoder: ProfileEncoder | undefined;
let running: Running | undefined;
let rotateTimer: ReturnType<typeof setTimeout> | undefined;
let waiting: Stopped[] = [];
let lastSendTime = -Infinity;
let unavailable = false;

/**
 * Called from `init()` when `@dash0/profiling` is enabled and the session is sampled. Does nothing
 * until an encoder is available, so pages that never load `@dash0/sdk-web/profiling` pay nothing.
 */
export function startProfiling(): void {
  encoder = vars.profiling.encoder ?? ((win as any)?.[GLOBAL_PROFILE_ENCODER_KEY] as ProfileEncoder | undefined);
  if (typeof encoder !== "function") {
    debug("No profile encoder provided. Profiling will not start.");
    return;
  }
  if (!isSessionSampledIn(sessionId ?? "", vars.profiling.sampleRate ?? 10)) {
    debug("Session is not sampled for profiling.");
    return;
  }

  if (doc) {
    addEventListener(doc, "visibilitychange", () => {
      if (doc!.visibilityState === "visible") startChunk();
    });
  }
  // Runs when the document is hidden as well as on pagehide, so this is also what pauses profiling
  // for hidden tabs. Sent uncompressed: gzip is asynchronous and the document may be gone first.
  onLastChance(() => stopChunk(false), LAST_CHANCE_PRIORITY_LARGE_PAYLOAD);
  // One chunk per page: `pushState` runs this before the location changes, so the new chunk takes the url
  // from the page view rather than from `location`.
  // Also restarts profiling after a last chance that did not unload the page, such as a cancelled `beforeunload`.
  onPageView((url) => {
    stopChunk(true);
    startChunk(url?.href);
  });

  startChunk();
}

function startChunk(url = win?.location.href): void {
  if (running || unavailable || doc?.visibilityState === "hidden" || !url || isUrlIgnored(url)) return;

  const Profiler = (win as unknown as { Profiler?: JsProfilerConstructor } | undefined)?.Profiler;
  if (typeof Profiler !== "function") {
    reportUnavailable("api_missing");
    return;
  }

  const sampleIntervalMs = Math.max(1, vars.profiling.sampleIntervalMs ?? 10);
  const chunkDurationMs = Math.max(MIN_CHUNK_DURATION_MS, vars.profiling.chunkDurationMs ?? 15000);
  try {
    running = {
      // Twice the samples a chunk needs, so a slow timer does not make the profiler drop samples.
      profiler: new Profiler({
        sampleInterval: sampleIntervalMs,
        maxBufferSize: Math.ceil((2 * chunkDurationMs) / sampleIntervalMs),
      }),
      startTime: perf.now(),
      url,
    };
  } catch (e) {
    // Chromium refuses with NotAllowedError when the document lacks `Document-Policy: js-profiling`.
    reportUnavailable((e as Error)?.name === "NotAllowedError" ? "document_policy" : "start_failed", e);
    return;
  }

  rotateTimer = setTimeout(() => {
    stopChunk(true);
    startChunk();
  }, chunkDurationMs);
}

/**
 * `compress` is false on the last chance to send, where the document may be gone before an idle period or a
 * gzip stream: those chunks, and any still waiting for idle time, skip both. `Profiler.stop()` is asynchronous,
 * so the current chunk can still be lost when the document goes before its trace arrives.
 */
function stopChunk(compress: boolean): void {
  if (!compress) flushWaiting(false);
  if (rotateTimer != null) {
    clearTimeout(rotateTimer);
    rotateTimer = undefined;
  }
  const current = running;
  running = undefined;
  if (!current) return;

  const endTime = perf.now();
  current.profiler
    .stop()
    .then((trace) => {
      const stopped = { trace, chunk: current, endTime };
      if (compress) sendLater(stopped);
      else emit([stopped], false);
    })
    .catch((e) => debug("Failed to stop profiler", e));
}

// Only the first waiting chunk schedules a send; the send empties the queue, so the next chunk schedules again.
function sendLater(stopped: Stopped): void {
  if (waiting.push(stopped) > 1) return;
  const delay = Math.max(0, lastSendTime + MIN_SEND_INTERVAL_MS - perf.now());
  if (delay === 0) whenIdle(() => flushWaiting(true));
  else setTimeout(() => whenIdle(() => flushWaiting(true)), delay);
}

function whenIdle(run: () => void): void {
  const requestIdleCallback = (win as unknown as { requestIdleCallback?: IdleScheduler } | undefined)
    ?.requestIdleCallback;
  if (typeof requestIdleCallback === "function")
    requestIdleCallback.call(win, run, { timeout: IDLE_ENCODE_TIMEOUT_MS });
  else setTimeout(run, 0);
}

function flushWaiting(compress: boolean): void {
  if (waiting.length === 0) return;
  const chunks = waiting;
  waiting = [];
  emit(chunks, compress);
}

function emit(stoppedChunks: Stopped[], compress: boolean): void {
  if (!encoder) return;
  lastSendTime = perf.now();
  const debugIdByUrl = readDebugIds();

  try {
    const encoded = encoder(stoppedChunks.map((stopped) => toProfileChunk(stopped, debugIdByUrl)));
    if (encoded.sampleCount === 0) return;
    debug("Sending profile", encoded);
    sendProfile(encoded.body, { compress });
  } catch (e) {
    warn("Failed to encode profile", e);
  }
}

function toProfileChunk({ trace, chunk, endTime }: Stopped, debugIdByUrl: Map<string, string>): ProfileChunk {
  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes, { url: chunk.url });

  const resources = trace.resources.map(scrubUrl);
  const debugIds: Record<string, string> = {};
  trace.resources.forEach((url, i) => {
    const debugId = debugIdByUrl.get(url);
    if (debugId) debugIds[resources[i]!] = debugId;
  });

  return {
    profileId: generateUniqueId(TRACE_ID_BYTES),
    trace: { ...trace, resources },
    debugIds,
    timeOrigin: perf.timeOrigin,
    startTime: chunk.startTime,
    endTime,
    sampleIntervalMs: chunk.profiler.sampleInterval,
    resource: vars.resource,
    scope: vars.scope,
    attributes,
  };
}

function reportUnavailable(reason: UnavailableReason, cause?: unknown): void {
  if (unavailable) return;
  unavailable = true;
  debug(`Profiling is unavailable: ${reason}`, cause);

  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.PROFILING_UNAVAILABLE);
  addCommonAttributes(attributes);
  const body: KeyValue[] = [];
  addAttribute(body, "reason", reason);
  sendLog({ timeUnixNano: nowNanos(), attributes, body: { kvlistValue: { values: body } } });
}
