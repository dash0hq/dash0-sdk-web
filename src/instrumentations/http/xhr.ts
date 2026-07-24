import {
  addEventListener,
  debug,
  observeResourcePerformance,
  parseUrl,
  removeEventListener,
  win,
  wrap,
} from "../../utils";
import { isUrlIgnored } from "../../utils/ignore-rules";
import {
  addAttribute,
  endSpan,
  Exception,
  InProgressSpan,
  recordException,
  setSpanStatus,
  startSpan,
} from "../../utils/otel";
import {
  ERROR_TYPE,
  HTTP_REQUEST_METHOD,
  HTTP_REQUEST_METHOD_ORIGINAL,
  HTTP_RESPONSE_STATUS_CODE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_UNSET,
} from "../../semantic-conventions";
import { vars, PropagatorType } from "../../vars";
import { httpRequestHeaderKey, httpResponseHeaderKey } from "../../utils/otel/http";
import { sendSpan } from "../../transport";
import {
  addResourceNetworkEvents,
  addResourceSize,
  addTraceContextHttpHeaders,
  determinePropagatorTypes,
  endSpanOnAbort,
  endSpanOnError,
  HTTP_METHOD_OTHER,
  isWellKnownHttpMethod,
} from "./utils";
import { addCommonAttributes, addUrlAttributes } from "../../attributes";

type XhrFailureKind = "error" | "timeout" | "abort";

type XhrState = {
  method: string;
  originalMethod: string;
  isWellKnownMethod: boolean;
  url: string;
  ignored: boolean;
  // Set when page code (typically a fetch polyfill whose fetch() the SDK already instrumented)
  // put a trace correlation header on this request before send() -- see onSetRequestHeader.
  alreadyTraced?: boolean;
  span?: InProgressSpan;
  propagatorTypes: PropagatorType[];
  capturedRequestHeaders?: Record<string, string>;
  completed: boolean;
  failureKind?: XhrFailureKind;
  performanceObserver?: ReturnType<typeof observeResourcePerformance>;
  listeners?: Array<[string, () => unknown]>;
};

const XHR_STATE = Symbol("dash0XhrState");

type InstrumentedXhr = XMLHttpRequest & { [XHR_STATE]?: XhrState };

// The un-wrapped setRequestHeader, captured when wrapping. Trace context headers are injected
// through it so the SDK's own headers neither land in capturedRequestHeaders nor trip the
// already-traced detection below.
let originalSetRequestHeader: XMLHttpRequest["setRequestHeader"] | undefined;

export function instrumentXhr() {
  if (!win || !win.XMLHttpRequest) {
    debug("Browser does not support XMLHttpRequest, skipping instrumentation");
    return;
  }

  const proto = win.XMLHttpRequest.prototype;
  wrap(proto, "open", wrapOpen);
  wrap(proto, "setRequestHeader", wrapSetRequestHeader);
  wrap(proto, "send", wrapSend);
}

function wrapOpen(original: XMLHttpRequest["open"]): XMLHttpRequest["open"] {
  return function (this: InstrumentedXhr, method: string, url: string | URL, ...rest: unknown[]) {
    let openArgs = [method, url, ...rest];
    try {
      // Pass the pre-coerced URL to the native method so a side-effectful custom toString runs
      // once, not twice. The method arg stays untouched -- its coercion is SDK bookkeeping only.
      openArgs = [method, onOpen(this, method, url), ...rest];
    } catch (e) {
      // Clear stale state from a previous open() on a reused instance so send() doesn't
      // attribute the new request to old state.
      this[XHR_STATE] = undefined;
      debug("failed to instrument XMLHttpRequest.open", e);
    }
    return original.apply(this, openArgs as Parameters<XMLHttpRequest["open"]>);
  };
}

function onOpen(xhr: InstrumentedXhr, method: string, url: string | URL): string {
  // Per spec, open() during an in-flight request terminates the fetch without firing
  // abort/loadend, so onLoadEnd never runs for the previous request. Clean it up here (before
  // anything below can throw) or its listeners, performance observer and span would leak on
  // every cancel-by-reopen cycle -- and its stale loadend listener would end the old span with
  // the next request's status.
  const previousState = xhr[XHR_STATE];
  if (previousState?.span && !previousState.completed) {
    cleanupAbandonedRequest(xhr, previousState);
  }

  const stringUrl = String(url);
  // Resolve relative URLs so ignore rules, propagator matching and url.* attributes see the same
  // absolute URL the fetch instrumentation matches against (Request resolves it there). Only the
  // SDK bookkeeping uses the resolved form -- the native open() still receives stringUrl.
  const resolvedUrl = parseUrl(stringUrl).href;
  const originalMethod = String(method ?? "GET");
  const isWellKnownMethodMatchingLeniently = isWellKnownHttpMethod(originalMethod.toUpperCase());
  const normalizedMethod = isWellKnownMethodMatchingLeniently ? originalMethod.toUpperCase() : HTTP_METHOD_OTHER;

  // A new open() call on a reused XHR instance resets state -- any prior span for this instance
  // has already been sent (completed requests) or was just ended as cancelled above, and this
  // open() is treated as the start of a brand-new request with its own span.
  xhr[XHR_STATE] = {
    method: normalizedMethod,
    originalMethod,
    isWellKnownMethod: isWellKnownHttpMethod(originalMethod),
    url: resolvedUrl,
    ignored: isUrlIgnored(resolvedUrl),
    propagatorTypes: determinePropagatorTypes(resolvedUrl),
    completed: false,
  };

  return stringUrl;
}

function wrapSetRequestHeader(original: XMLHttpRequest["setRequestHeader"]): XMLHttpRequest["setRequestHeader"] {
  // wrap() only invokes this factory when it actually wraps (it skips already-instrumented
  // targets), so this can never capture the SDK's own wrapper on double instrumentation.
  originalSetRequestHeader = original;
  return function (this: InstrumentedXhr, name: string, value: string) {
    original.call(this, name, value);

    try {
      onSetRequestHeader(this, name, value);
    } catch (e) {
      debug("failed to instrument XMLHttpRequest.setRequestHeader", e);
    }
  };
}

function onSetRequestHeader(xhr: InstrumentedXhr, name: string, value: string) {
  const state = xhr[XHR_STATE];
  if (!state || state.ignored) return;

  // Match against the lowercased name so a regex behaves the same here as for fetch,
  // where Headers iteration yields lowercased names.
  const lowerName = name.toLowerCase();

  // A trace correlation header showing up here means someone else is already tracing this
  // request -- the SDK injects its own headers via the un-wrapped setRequestHeader, so it never
  // trips this. The typical source is a fetch polyfill built on XHR: the fetch instrumentation
  // has already created a span and injected headers for the logical request, and the polyfill
  // replays them onto the underlying XHR. send() skips span creation and injection for such
  // requests -- a second injection would combine into one invalid comma-joined header value,
  // and a second span would double-report the request (the fetch span's resource matcher
  // already accepts initiatorType "xmlhttprequest" to cover polyfills). Note this only
  // detects the polyfill case when the fetch side actually injected headers (a propagator
  // matched the URL) -- without that, the polyfill case still yields two spans.
  if (lowerName === "traceparent" || lowerName === "x-amzn-trace-id") {
    state.alreadyTraced = true;
  }

  // Filter at capture time like the fetch instrumentation -- never retain unmatched
  // (potentially sensitive) headers on the page-reachable XHR instance.
  if (vars.headersToCapture.length === 0) return;
  if (!vars.headersToCapture.some((rxp) => rxp.test(lowerName))) return;

  const headers = (state.capturedRequestHeaders ??= {});
  // Native XHR combines repeated setRequestHeader() calls for the same name
  // (case-insensitively) into a single "a, b" value -- mirror that.
  headers[lowerName] = lowerName in headers ? `${headers[lowerName]}, ${value}` : value;
}

function wrapSend(original: XMLHttpRequest["send"]): XMLHttpRequest["send"] {
  return function (this: InstrumentedXhr, body?: Document | XMLHttpRequestBodyInit | null) {
    const state = this[XHR_STATE];
    if (!state || state.ignored) {
      if (state?.ignored) {
        debug(`Not creating span for XMLHttpRequest because the url is ignored, URL: ${state.url}`);
      }
      return original.call(this, body);
    }

    if (state.alreadyTraced) {
      debug(
        `Not creating span for XMLHttpRequest because a trace correlation header is already present, URL: ${state.url}`
      );
      return original.call(this, body);
    }

    // send() on an already-sent request throws InvalidStateError natively. Don't create a second
    // span and set of listeners for it -- that would overwrite the in-flight request's state and
    // attribute its response to the wrong span.
    if (state.span && !state.completed) {
      return original.call(this, body);
    }

    try {
      onSend(this, state);
    } catch (e) {
      cleanupFailedSend(this, state);
      debug("failed to instrument XMLHttpRequest.send", e);
    }

    try {
      return original.call(this, body);
    } catch (e) {
      // Synchronous XHR reports network errors and timeouts by making send() throw -- per spec
      // no loadend fires for sync failures, so onLoadEnd never runs and this is the only place
      // the request can be finalized.
      endSpanOnSyncSendError(this, state, e);
      throw e;
    }
  };
}

function endSpanOnSyncSendError(xhr: InstrumentedXhr, state: XhrState, error: unknown) {
  if (state.completed) return;
  state.completed = true;

  try {
    for (const [eventType, listener] of state.listeners ?? []) {
      removeEventListener(xhr, eventType, listener);
    }
    state.performanceObserver?.cancel();

    const span = state.span;
    if (!span) return;

    const failureKind: XhrFailureKind =
      state.failureKind ?? ((error as { name?: unknown } | null)?.name === "TimeoutError" ? "timeout" : "error");
    recordException(
      span,
      (error as Exception) ?? { name: failureKind, message: `XMLHttpRequest failed: ${state.url}` }
    );
    addAttribute(span.attributes, ERROR_TYPE, failureKind);
    sendSpan(endSpan(span, { code: SPAN_STATUS_ERROR, message: `XMLHttpRequest failed: ${state.url}` }, undefined));
  } catch (_e) {
    // Best-effort only -- never mask the page's original exception from send().
  }
}

function onSend(xhr: InstrumentedXhr, state: XhrState) {
  const span = startSpan(`HTTP ${state.method}`);
  addCommonAttributes(span.attributes);
  addUrlAttributes(span.attributes, state.url);
  addAttribute(span.attributes, HTTP_REQUEST_METHOD, state.method);
  if (!state.isWellKnownMethod) {
    addAttribute(span.attributes, HTTP_REQUEST_METHOD_ORIGINAL, state.originalMethod);
  }
  state.span = span;

  if (state.propagatorTypes.length > 0) {
    try {
      addTraceContextHttpHeaders(
        (name, value) => (originalSetRequestHeader ?? xhr.setRequestHeader).call(xhr, name, value),
        xhr,
        span,
        state.propagatorTypes
      );
    } catch (e) {
      // setRequestHeader throws InvalidStateError if called before open() succeeded, or after
      // send(). This should not normally happen since we only reach here from within send()
      // itself with state populated by a prior open(), but guard defensively.
      debug("failed to inject trace context headers on XMLHttpRequest", e);
    }
  }

  // Entries were already filtered against vars.headersToCapture (and lowercased) at
  // setRequestHeader() time.
  if (state.capturedRequestHeaders) {
    for (const [name, value] of Object.entries(state.capturedRequestHeaders)) {
      addAttribute(span.attributes, httpRequestHeaderKey(name), value);
    }
  }

  const performanceObserver = observeResourcePerformance({
    resourceMatcher: ({ initiatorType, name }) => initiatorType === "xmlhttprequest" && name === state.url,
    maxWaitForResourceMillis: vars.maxWaitForResourceTimingsMillis,
    maxToleranceForResourceTimingsMillis: vars.maxToleranceForResourceTimingsMillis,
    onEnd: ({ duration, resource }) => {
      if (resource) {
        addResourceNetworkEvents(span, resource);
        addResourceSize(span, resource);
      }
      sendSpan(endSpan(span, undefined, duration * 1000000));
    },
  });
  state.performanceObserver = performanceObserver;
  performanceObserver.start();

  // Keep references to the per-request listeners so onLoadEnd can remove them again -- loadend
  // fires for every request outcome, so cleanup there prevents listeners (and their state/span
  // closures) from accumulating on reused XHR instances.
  state.listeners = [
    [
      "error",
      () => {
        state.failureKind = "error";
      },
    ],
    [
      "timeout",
      () => {
        state.failureKind = "timeout";
      },
    ],
    [
      "abort",
      () => {
        state.failureKind = "abort";
      },
    ],
    ["loadend", () => onLoadEnd(xhr, state)],
  ];
  for (const [eventType, listener] of state.listeners) {
    addEventListener(xhr, eventType, listener);
  }
}

function cleanupAbandonedRequest(xhr: InstrumentedXhr, state: XhrState) {
  // Mark completed first so a stray late event stays a no-op even if listener removal fails.
  state.completed = true;
  try {
    for (const [eventType, listener] of state.listeners ?? []) {
      removeEventListener(xhr, eventType, listener);
    }
    state.performanceObserver?.cancel();
    if (state.span) {
      // Report the request as cancelled, matching how fetch reports aborted requests.
      endSpanOnAbort(state.span);
    }
  } catch (_e) {
    // Best-effort cleanup only -- never let it throw into the page's open() call.
  }
}

function cleanupFailedSend(xhr: InstrumentedXhr, state: XhrState) {
  try {
    state.performanceObserver?.cancel();
    for (const [eventType, listener] of state.listeners ?? []) {
      removeEventListener(xhr, eventType, listener);
    }
  } catch (_e) {
    // Best-effort cleanup only -- never let it throw into the page's send() call.
  }
  // Drop the span so a stray loadend for this request doesn't emit a half-initialized span.
  state.span = undefined;
}

function onLoadEnd(xhr: InstrumentedXhr, state: XhrState) {
  if (state.completed) return;
  state.completed = true;

  // The request cycle is over -- remove the per-request listeners so they don't pile up on reused
  // XHR instances.
  for (const [eventType, listener] of state.listeners ?? []) {
    removeEventListener(xhr, eventType, listener);
  }

  const span = state.span;
  if (!span) return;

  const performanceObserver = state.performanceObserver;

  if (state.failureKind === "abort") {
    performanceObserver?.cancel();
    endSpanOnAbort(span);
    return;
  }

  let status = 0;
  try {
    status = xhr.status;
  } catch (_e) {
    // Reading .status can throw in some environments if accessed at the wrong readyState.
    status = 0;
  }

  if (state.failureKind === "error" || state.failureKind === "timeout" || status === 0) {
    performanceObserver?.cancel();
    const failureKind = state.failureKind ?? "error";
    // The failure kind doubles as the exception name, so endSpanOnError derives
    // error.type = failureKind from it.
    endSpanOnError(span, { name: failureKind, message: `XMLHttpRequest failed: ${state.url}` });
    return;
  }

  setSpanStatus(span, status >= 200 && status < 400 ? SPAN_STATUS_UNSET : SPAN_STATUS_ERROR);
  addAttribute(span.attributes, HTTP_RESPONSE_STATUS_CODE, String(status));
  tryCaptureResponseHeaders(xhr, span);

  performanceObserver?.end();
}

function tryCaptureResponseHeaders(xhr: XMLHttpRequest, span: InProgressSpan) {
  try {
    if (!vars.headersToCapture.length) return;

    const raw = xhr.getAllResponseHeaders();
    if (!raw) return;

    raw
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .forEach((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) return;

        const name = line.substring(0, separatorIndex).trim();
        const value = line.substring(separatorIndex + 1).trim();

        if (vars.headersToCapture.some((rxp) => rxp.test(name))) {
          addAttribute(span.attributes, httpResponseHeaderKey(name), value);
        }
      });
  } catch (e) {
    debug("unable to capture http response headers", e);
  }
}
