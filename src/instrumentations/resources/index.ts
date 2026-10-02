import { debug, isPerformanceObserverAvailable, domHRTimestampToNanos, parseUrl, perf, win } from "../../utils";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addAttribute, endSpan, InProgressSpan, startSpan } from "../../utils/otel";
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PROTOCOL_NAME,
  RESOURCE_CACHED,
  RESOURCE_DELIVERY_TYPE,
  RESOURCE_INITIATOR_TYPE,
  RESOURCE_RENDER_BLOCKING_STATUS,
} from "../../semantic-conventions";
import { addCommonAttributes, addUrlAttributes } from "../../attributes";
import { addResourceNetworkEvents, addResourceSize } from "../http/utils";
import { sendResourceSpan } from "../../transport";
import { vars } from "../../vars";

/**
 * Initiator types the HTTP instrumentations already emit spans for. Capturing them here too would
 * duplicate every fetch and XHR call. `xmlhttprequest` also covers fetch polyfills, which report
 * themselves as XHR -- the same pairing the fetch instrumentation's resource matcher uses.
 */
const HTTP_INITIATOR_TYPES = ["fetch", "xmlhttprequest"];

/**
 * How many entries the browser keeps in its resource timing buffer. The spec default is 250, which
 * an image-heavy page exhausts before `init()` has even run -- and the entries lost are the ones at
 * the start of the page load, which are the ones worth having. Raising it costs a bounded amount of
 * memory and buys the `buffered: true` replay below a complete picture.
 */
const RESOURCE_TIMING_BUFFER_SIZE = 1000;

/**
 * Guards against the broken `duration` values old browsers have been seen to report -- the same
 * defence `observeResourcePerformance` applies. A resource that took longer than this did not.
 */
const ONE_DAY_IN_MILLIS = 1000 * 60 * 60 * 24;

/**
 * Fields browsers added after the `PerformanceResourceTiming` lib types were written, or that only
 * some engines implement. Declared here rather than asserted at each use so the optionality stays
 * visible: every one of these can legitimately be absent.
 */
type ExtendedResourceTiming = PerformanceResourceTiming & {
  renderBlockingStatus?: string;
  deliveryType?: string;
  responseStatus?: number;
};

let observer: PerformanceObserver | undefined;
let spansEmitted = 0;
let capReported = false;

/**
 * Emits one span per static asset the browser loaded -- scripts, stylesheets, images, fonts, media,
 * iframes -- from the entries the resource timing API reports. Fetch and XHR calls are excluded;
 * they have their own instrumentations, which capture request detail this API cannot see.
 *
 * Unlike `observeResourcePerformance`, which is started by a specific request and torn down when it
 * ends, this observer stands for the lifetime of the document. It has to: nothing in the page tells
 * the SDK that an image is about to load, so there is no call to hang the observation off.
 */
export function startResourceTimingInstrumentation(): void {
  if (!isPerformanceObserverAvailable || !win?.PerformanceObserver) {
    debug("Browser does not support PerformanceObserver, skipping resource timing instrumentation");
    return;
  }

  // Best effort: the buffer may already be full by the time init() runs, and the method is absent
  // in older engines. Neither case is worth failing the instrumentation over.
  try {
    perf.setResourceTimingBufferSize?.(RESOURCE_TIMING_BUFFER_SIZE);
  } catch (_e) {
    // Ignore. Entries observed from here on still arrive; only the buffered replay is affected.
  }

  try {
    observer = new win.PerformanceObserver(onEntries);
    // `buffered` replays entries recorded before this point, which on a typical page is most of the
    // critical path -- the SDK almost never initialises before the first script or stylesheet.
    observer.observe({ type: "resource", buffered: true });
  } catch (_e) {
    // Some browsers throw for unsupported entry types rather than ignoring them. Treat it the same
    // as the API being unavailable.
    debug("Failed to observe resource timings, skipping resource timing instrumentation");
    observer = undefined;
  }
}

/**
 * Stops the observer and resets the per-page-load state. Exported for tests; the observer otherwise
 * lives as long as the document does.
 */
export function stopResourceTimingInstrumentation(): void {
  if (observer) {
    try {
      observer.disconnect();
    } catch (_e) {
      // disconnect() throws when observe() never succeeded. Nothing to clean up in that case.
    }
    observer = undefined;
  }
  spansEmitted = 0;
  capReported = false;
}

function onEntries(list: PerformanceObserverEntryList): void {
  try {
    for (const entry of list.getEntriesByType("resource")) {
      // The polymorphism is not expressed in the lib types. The cast is safe: entries of type
      // "resource" are always PerformanceResourceTiming.
      onEntry(entry as ExtendedResourceTiming);
    }
  } catch (e) {
    debug("Failed to process resource timing entries", e);
  }
}

function onEntry(entry: ExtendedResourceTiming): void {
  if (!isCaptured(entry)) {
    return;
  }

  const maxSpans = vars.resourceTiming.maxSpansPerPageLoad ?? 100;
  if (spansEmitted >= maxSpans) {
    if (!capReported) {
      capReported = true;
      debug(`Reached maxSpansPerPageLoad (${maxSpans}). Further static-asset spans are dropped for this page load.`);
    }
    return;
  }
  spansEmitted++;

  sendResourceSpan(endSpan(toSpan(entry), undefined, durationNanos(entry)));
}

function isCaptured(entry: ExtendedResourceTiming): boolean {
  const initiatorType = entry.initiatorType;

  if (HTTP_INITIATOR_TYPES.includes(initiatorType)) {
    return false;
  }

  // Also covers data URLs and the SDK's own telemetry requests to the configured endpoints.
  if (isUrlIgnored(entry.name)) {
    return false;
  }

  const allowed = vars.resourceTiming.initiatorTypes;
  return !allowed || allowed.includes(initiatorType);
}

function toSpan(entry: ExtendedResourceTiming): InProgressSpan {
  const span = startSpan(spanName(entry), { startTimeUnixNano: domHRTimestampToNanos(entry.startTime) });

  addCommonAttributes(span.attributes);
  addUrlAttributes(span.attributes, entry.name);

  // The browser issues a GET for every resource it loads on the page's behalf; there is no other
  // method a resource timing entry can represent.
  addAttribute(span.attributes, HTTP_REQUEST_METHOD, "GET");
  addAttribute(span.attributes, RESOURCE_INITIATOR_TYPE, entry.initiatorType);

  if (entry.nextHopProtocol) {
    addAttribute(span.attributes, NETWORK_PROTOCOL_NAME, entry.nextHopProtocol);
  }
  // Which asset held up rendering is the question static-asset timing is usually asked to answer,
  // so this is the attribute worth having even where the rest of the entry is opaque.
  if (entry.renderBlockingStatus) {
    addAttribute(span.attributes, RESOURCE_RENDER_BLOCKING_STATUS, entry.renderBlockingStatus);
  }
  if (entry.deliveryType) {
    addAttribute(span.attributes, RESOURCE_DELIVERY_TYPE, entry.deliveryType);
  }
  // Chromium only. Absent elsewhere rather than zero, so an absent value is not reported as a
  // failed request.
  if (entry.responseStatus) {
    addAttribute(span.attributes, HTTP_RESPONSE_STATUS_CODE, String(entry.responseStatus));
  }

  // A body that arrived decoded but cost nothing on the wire came out of a cache. Both numbers are
  // zero for cross-origin resources without Timing-Allow-Origin, which is why the decoded size has
  // to be positive before the conclusion is drawn.
  if (entry.transferSize === 0 && entry.decodedBodySize > 0) {
    addAttribute(span.attributes, RESOURCE_CACHED, true);
  }

  addResourceSize(span, entry);
  // Cross-origin resources without Timing-Allow-Origin report every sub-phase as 0. The shared
  // helper skips zeros unless startTime is itself 0, so those spans carry a start and a duration
  // and no misleading phase breakdown.
  addResourceNetworkEvents(span, entry);

  return span;
}

/**
 * A name that reads in a waterfall: the initiator type and the file, e.g. `script main.a81f.js` or
 * `img hero.webp`. Falls back to the host for URLs with no path segment to speak of.
 */
function spanName(entry: ExtendedResourceTiming): string {
  let label = entry.name;
  try {
    const parsed = parseUrl(entry.name);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    label = lastSegment || parsed.hostname || entry.name;
  } catch (_e) {
    // Keep the raw name. Resource names are usually absolute URLs, but blob: and extension schemes
    // do turn up and are not worth dropping the span over.
  }
  return `${entry.initiatorType} ${label}`;
}

/**
 * The entry's duration in nanoseconds, never the wall clock. An entry is observed after the
 * resource has finished loading, so falling back to "now" -- which is what `endSpan` does when
 * given no duration -- would stretch the span by however long the observer took to deliver it.
 */
function durationNanos(entry: ExtendedResourceTiming): number {
  if (isPlausibleDuration(entry.duration)) {
    return entry.duration * 1000000;
  }
  // Some older engines have been seen to report a nonsense `duration` while the underlying marks
  // are sound.
  const fromMarks = entry.responseEnd - entry.startTime;
  return isPlausibleDuration(fromMarks) ? fromMarks * 1000000 : 0;
}

function isPlausibleDuration(value: number): boolean {
  return typeof value === "number" && !isNaN(value) && value >= 0 && value < ONE_DAY_IN_MILLIS;
}
