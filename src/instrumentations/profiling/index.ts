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
import { ProfileEncoder, ProfilerTrace } from "../../types/profiling";

/** Global set by `dash0-profiling.iife.js`. */
export const GLOBAL_PROFILE_ENCODER_KEY = "dash0ProfileEncoder";

type UnavailableReason = "api_missing" | "document_policy" | "start_failed";

type JsProfiler = {
  readonly sampleInterval: number;
  stop(): Promise<ProfilerTrace>;
};
type JsProfilerConstructor = new (opts: { sampleInterval: number; maxBufferSize: number }) => JsProfiler;

type Running = { profiler: JsProfiler; startTime: number; url: string | undefined };
type Stopped = { trace: ProfilerTrace; chunk: Running; endTime: number };
type IdleScheduler = (callback: () => void, opts: { timeout: number }) => number;

// Encoding a chunk takes up to 10 ms on a slow CPU, so it waits for idle time; the timeout keeps a busy page
// from holding chunks back for long.
const IDLE_ENCODE_TIMEOUT_MS = 2000;

let encoder: ProfileEncoder | undefined;
let running: Running | undefined;
let rotateTimer: ReturnType<typeof setTimeout> | undefined;
let waitingForIdle: Stopped[] = [];
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
  onPageView((url) => {
    if (!running) return;
    stopChunk(true);
    startChunk(url?.href);
  });

  startChunk();
}

function startChunk(url = win?.location.href): void {
  if (running || unavailable || doc?.visibilityState === "hidden") return;

  const Profiler = (win as unknown as { Profiler?: JsProfilerConstructor } | undefined)?.Profiler;
  if (typeof Profiler !== "function") {
    reportUnavailable("api_missing");
    return;
  }

  const sampleIntervalMs = vars.profiling.sampleIntervalMs ?? 10;
  const chunkDurationMs = vars.profiling.chunkDurationMs ?? 15000;
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
 * gzip stream: those chunks, and any still waiting for idle time, are encoded and sent synchronously.
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
      if (compress) sendWhenIdle(stopped);
      else emit(stopped, false);
    })
    .catch((e) => debug("Failed to stop profiler", e));
}

// Only the first waiting chunk schedules a flush; the flush empties the queue, so the next chunk schedules again.
function sendWhenIdle(stopped: Stopped): void {
  if (waitingForIdle.push(stopped) > 1) return;
  const requestIdleCallback = (win as unknown as { requestIdleCallback?: IdleScheduler } | undefined)
    ?.requestIdleCallback;
  const run = () => flushWaiting(true);
  if (typeof requestIdleCallback === "function")
    requestIdleCallback.call(win, run, { timeout: IDLE_ENCODE_TIMEOUT_MS });
  else setTimeout(run, 0);
}

function flushWaiting(compress: boolean): void {
  const chunks = waitingForIdle;
  waitingForIdle = [];
  chunks.forEach((chunk) => emit(chunk, compress));
}

function emit({ trace, chunk, endTime }: Stopped, compress: boolean): void {
  if (!encoder || !chunk.url || isUrlIgnored(chunk.url)) return;

  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes, { url: chunk.url });

  const resources = trace.resources.map(scrubUrl);
  const debugIdByUrl = readDebugIds();
  const debugIds: Record<string, string> = {};
  trace.resources.forEach((url, i) => {
    const debugId = debugIdByUrl.get(url);
    if (debugId) debugIds[resources[i]!] = debugId;
  });

  try {
    const encoded = encoder({
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
    });
    if (encoded.sampleCount === 0) return;
    debug("Sending profile", encoded);
    sendProfile(encoded.body, { compress });
  } catch (e) {
    warn("Failed to encode profile", e);
  }
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
