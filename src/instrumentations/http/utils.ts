import {
  addAttribute,
  addSpanEvent,
  addW3CTraceContextHttpHeaders,
  addXRayTraceContextHttpHeaders,
  endSpan,
  errorToSpanStatus,
  Exception,
  InProgressSpan,
  recordException,
} from "../../utils/otel";
import { domHRTimestampToNanos, hasKey, isSameOrigin, PerformanceTimingNames } from "../../utils";
import { matchesAny } from "../../utils/ignore-rules";
import { ERROR_TYPE, HTTP_RESPONSE_BODY_SIZE, WEB_REQUEST_CANCELLED } from "../../semantic-conventions";
import { vars, PropagatorType } from "../../vars";
import { sendSpan } from "../../transport";
import { scrubPageUrls } from "../../attributes";

// SEE: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/attributes-registry/http.md?plain=1#L67
const KNOWN_HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"];
export const HTTP_METHOD_OTHER = "_OTHER";

export function isWellKnownHttpMethod(method: string): boolean {
  return KNOWN_HTTP_METHODS.includes(method);
}

export function addResourceNetworkEvents(span: InProgressSpan, resource: PerformanceResourceTiming) {
  const ignoreZeros = resource.startTime !== 0;

  addSpanNetworkEvent(span, PerformanceTimingNames.FETCH_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.DOMAIN_LOOKUP_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.DOMAIN_LOOKUP_END, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.CONNECT_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.SECURE_CONNECTION_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.CONNECT_END, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.REQUEST_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.RESPONSE_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.RESPONSE_END, resource, ignoreZeros);
}

function addSpanNetworkEvent(
  span: InProgressSpan,
  propertyName: string,
  resource: PerformanceResourceTiming,
  ignoreZeros: boolean = true
) {
  if (
    !hasKey(resource, propertyName) ||
    typeof resource[propertyName] !== "number" ||
    (ignoreZeros && resource[propertyName] === 0)
  ) {
    return;
  }

  addSpanEvent(span, propertyName, domHRTimestampToNanos(resource[propertyName]));
}

export function addResourceSize(span: InProgressSpan, resource: PerformanceResourceTiming) {
  const encodedLength = resource.encodedBodySize;
  if (encodedLength != undefined) {
    addAttribute(span.attributes, HTTP_RESPONSE_BODY_SIZE, encodedLength);
  }
}

// Sets error.type alongside the recorded exception so failed fetch and XHR spans are equally
// queryable by error.type. The value is the exception name (e.g. TypeError) -- XHR's synthetic
// failure exceptions carry their failure kind ("error"/"timeout") as the name, so both
// instrumentations converge here. Note the shapes still differ for cases inherent to the APIs:
// a fetch that resolves with status 0 (e.g. opaque responses) never reaches this function and
// instead gets error.type = response.type plus http.response.status_code "0".
export function endSpanOnError(span: InProgressSpan, error: Exception, requestUrl?: string) {
  error = scrubException(error, requestUrl);
  recordException(span, error);
  const errorType =
    typeof error === "object" && error ? (error.name ?? (error.code != null ? String(error.code) : "error")) : "error";
  addAttribute(span.attributes, ERROR_TYPE, errorType);
  sendSpan(endSpan(span, errorToSpanStatus(error), undefined));
}

/**
 * Error messages and stack traces can contain the page url (inline script frames) and the request url (browser
 * network error messages), so both pass the url attribute scrubber. Non-string values are kept as they are.
 */
export function scrubException(error: Exception, requestUrl?: string): Exception {
  const scrub = (value: unknown) => (typeof value === "string" ? scrubPageUrls(value, requestUrl) : value);
  if (!error || typeof error !== "object") return scrub(error) as Exception;

  // Error properties are not enumerable and `name` lives on the prototype, so they are copied explicitly. Only
  // present properties are copied to keep `"message" in error` checks working.
  const scrubbed: Record<string, unknown> = {};
  for (const key of ["code", "name", "message", "stack"] as const) {
    if (key in error) scrubbed[key] = key === "code" ? error[key] : scrub(error[key]);
  }
  // Without a message the span status falls back to `String(error)`, which may be a custom text.
  scrubbed.toString = () => scrubPageUrls(String(error), requestUrl);
  return scrubbed as unknown as Exception;
}

// Cancellations are benign: no error status, no error.type. This also covers fetch calls aborted
// by AbortSignal.timeout() -- the signal is aborted by the time the rejection is handled, so a
// fetch timeout surfaces as a cancellation while an XHR timeout is an ERROR span with
// error.type = "timeout". That asymmetry is inherent to the two APIs.
export function endSpanOnAbort(span: InProgressSpan) {
  addAttribute(span.attributes, WEB_REQUEST_CANCELLED, true);
  sendSpan(endSpan(span, undefined, undefined));
}

export function determinePropagatorTypes(url: string): PropagatorType[] {
  const matchingTypes: PropagatorType[] = [];
  const isUrlSameOrigin = isSameOrigin(url);

  // For same-origin requests, always include traceparent + all configured propagators
  if (isUrlSameOrigin) {
    // Always add traceparent for same-origin requests
    matchingTypes.push("traceparent");

    // Add all other configured propagator types for same-origin requests
    if (vars.propagators) {
      for (const propagator of vars.propagators) {
        if (propagator.type !== "traceparent" && !matchingTypes.includes(propagator.type)) {
          matchingTypes.push(propagator.type);
        }
      }
    }
    return matchingTypes;
  }

  // For cross-origin requests, use new propagators config if available
  if (vars.propagators) {
    for (const propagator of vars.propagators) {
      if (matchesAny(propagator.match, url)) {
        // Avoid duplicates
        if (!matchingTypes.includes(propagator.type)) {
          matchingTypes.push(propagator.type);
        }
      }
    }
    return matchingTypes;
  }

  return [];
}

export function addTraceContextHttpHeaders(
  fn: (name: string, value: string) => void,
  ctx: unknown,
  span: InProgressSpan,
  types: PropagatorType[]
) {
  for (const type of types) {
    if (type === "xray") {
      addXRayTraceContextHttpHeaders(fn, ctx, span);
    } else {
      addW3CTraceContextHttpHeaders(fn, ctx, span);
    }
  }
}
