import { debug, isPerformanceObserverAvailable, domHRTimestampToNanos, perf, win } from "../../utils";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addAttribute, endSpan, InProgressSpan, setSpanStatus, startSpan } from "../../utils/otel";
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  RESOURCE_CACHED,
  RESOURCE_DELIVERY_TYPE,
  RESOURCE_INITIATOR_TYPE,
  RESOURCE_RENDER_BLOCKING_STATUS,
  SPAN_STATUS_ERROR,
  URL_DOMAIN,
  URL_PATH,
} from "../../semantic-conventions";
import { addCommonAttributes, addUrlAttributes } from "../../attributes";
import { addResourceNetworkEvents, addResourceSize } from "../http/utils";
import { onPageView } from "../navigation/event";
import { sendResourceSpan } from "../../transport";
import { vars } from "../../vars";
import { KeyValue } from "../../types/otlp";

/**
 * Initiator types this instrumentation never captures.
 *
 * `fetch` and `xmlhttprequest` have their own instrumentations, which see request and response
 * detail resource timing cannot; capturing them here would duplicate every API call. (`fetch`
 * polyfills report themselves as XHR, the same pairing the fetch instrumentation's own resource
 * matcher uses.)
 *
 * `beacon` and `ping` are POSTs, not static assets, and resource timing gives no way to tell --
 * they would be recorded as GETs for a resource that is not one.
 */
const EXCLUDED_INITIATOR_TYPES = ["fetch", "xmlhttprequest", "beacon", "ping"];

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

  // The cap is per page view, not per document: an SPA that never reloads would otherwise stop
  // reporting assets for the rest of the session once a single page had spent the budget.
  onPageView(resetCap);

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
 * Stops the observer and resets the per-page-view state. Exported for tests; the observer otherwise
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
  resetCap();
}

function resetCap(): void {
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
      debug(`Reached maxSpansPerPageLoad (${maxSpans}). Further static-asset spans are dropped for this page view.`);
    }
    return;
  }
  spansEmitted++;

  sendResourceSpan(endSpan(toSpan(entry), undefined, durationNanos(entry)));
}

function isCaptured(entry: ExtendedResourceTiming): boolean {
  const initiatorType = entry.initiatorType;

  if (EXCLUDED_INITIATOR_TYPES.includes(initiatorType)) {
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
  // Built before the span so the name can be derived from the *scrubbed* url attributes. Naming the
  // span from `entry.name` would route the raw URL around `urlAttributeScrubber`, leaking whatever
  // a customer configured it to remove -- tokens in a signed asset URL, an id in a path segment.
  const urlAttributes: KeyValue[] = [];
  addUrlAttributes(urlAttributes, entry.name);

  const span = startSpan(spanName(entry, urlAttributes), {
    startTimeUnixNano: domHRTimestampToNanos(entry.startTime),
  });

  addCommonAttributes(span.attributes);
  span.attributes.push(...urlAttributes);

  // The browser issues a GET for every resource it loads on the page's behalf. Initiator types that
  // can represent another method are excluded above rather than guessed at.
  addAttribute(span.attributes, HTTP_REQUEST_METHOD, "GET");
  addAttribute(span.attributes, RESOURCE_INITIATOR_TYPE, entry.initiatorType);

  addProtocolAttributes(span, entry.nextHopProtocol);

  // Which asset held up rendering is the question static-asset timing is usually asked to answer,
  // so this is the attribute worth having even where the rest of the entry is opaque.
  if (entry.renderBlockingStatus) {
    addAttribute(span.attributes, RESOURCE_RENDER_BLOCKING_STATUS, entry.renderBlockingStatus);
  }
  if (entry.deliveryType) {
    addAttribute(span.attributes, RESOURCE_DELIVERY_TYPE, entry.deliveryType);
  }

  // Chromium only, and 0 when unavailable rather than absent -- so an unknown status must not be
  // reported, and must not be mistaken for a failure.
  if (entry.responseStatus) {
    addAttribute(span.attributes, HTTP_RESPONSE_STATUS_CODE, String(entry.responseStatus));
    if (entry.responseStatus >= 400) {
      // Matches the fetch and XHR instrumentations, so a stylesheet that 404s after a bad deploy is
      // as visible in error views as a failed API call.
      setSpanStatus(span, SPAN_STATUS_ERROR);
    }
  }

  // A body that arrived decoded but cost nothing on the wire came out of a cache. Both numbers are
  // zero for cross-origin resources without Timing-Allow-Origin, which is why the decoded size has
  // to be positive before the conclusion is drawn.
  if (entry.transferSize === 0 && entry.decodedBodySize > 0) {
    addAttribute(span.attributes, RESOURCE_CACHED, true);
  }

  // Only when the browser actually disclosed it. A cross-origin resource without
  // Timing-Allow-Origin reports 0, which would read as an empty response and skew size aggregates.
  if (entry.encodedBodySize > 0) {
    addResourceSize(span, entry);
  }

  // Cross-origin resources without Timing-Allow-Origin report the intermediate phases as 0. The
  // shared helper skips zeros unless startTime is itself 0, so those spans carry a start, a
  // duration and no misleading phase breakdown.
  addResourceNetworkEvents(span, entry);

  return span;
}

/**
 * Splits `nextHopProtocol` into the OTel `network.protocol.*` pair. The ALPN token the browser
 * reports (`h2`, `h3`, `http/1.1`) is not what semconv expects in `network.protocol.name`, which
 * wants the protocol itself with the version alongside it -- otherwise semconv-based queries never
 * match these spans. An unrecognised token is passed through as the name rather than dropped.
 */
function addProtocolAttributes(span: InProgressSpan, nextHopProtocol: string | undefined): void {
  if (!nextHopProtocol) return;

  if (nextHopProtocol === "h2" || nextHopProtocol === "h3") {
    addAttribute(span.attributes, NETWORK_PROTOCOL_NAME, "http");
    addAttribute(span.attributes, NETWORK_PROTOCOL_VERSION, nextHopProtocol.slice(1));
    return;
  }

  if (nextHopProtocol.indexOf("http/") === 0) {
    addAttribute(span.attributes, NETWORK_PROTOCOL_NAME, "http");
    addAttribute(span.attributes, NETWORK_PROTOCOL_VERSION, nextHopProtocol.slice("http/".length));
    return;
  }

  addAttribute(span.attributes, NETWORK_PROTOCOL_NAME, nextHopProtocol);
}

/**
 * A name that reads in a waterfall: the initiator type and the file, e.g. `script main.a81f.js` or
 * `img hero.webp`. Read back off the already-scrubbed url attributes, so a customer's
 * `urlAttributeScrubber` governs the span name too. Falls back to the domain, and then to the
 * initiator type alone, when scrubbing left nothing to name the asset by.
 */
function spanName(entry: ExtendedResourceTiming, urlAttributes: KeyValue[]): string {
  const path = stringAttribute(urlAttributes, URL_PATH);
  const label = path?.split("/").filter(Boolean).pop() || stringAttribute(urlAttributes, URL_DOMAIN);

  return label ? `${entry.initiatorType} ${label}` : entry.initiatorType;
}

function stringAttribute(attributes: KeyValue[], key: string): string | undefined {
  return attributes.find((a) => a.key === key)?.value?.stringValue;
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
