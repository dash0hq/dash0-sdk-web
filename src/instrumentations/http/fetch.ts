import { debug, observeResourcePerformance, perf, win, setTimeout, isSameOrigin, wrap, parseUrl } from "../../utils";
import { isUrlIgnored, matchesAny } from "../../utils/ignore-rules";
import {
  addAttribute,
  setSpanStatus,
  addW3CTraceContextHttpHeaders,
  addXRayTraceContextHttpHeaders,
  endSpan,
  errorToSpanStatus,
  Exception,
  InProgressSpan,
  recordException,
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
import { addResourceNetworkEvents, addResourceSize, HTTP_METHOD_OTHER, isWellKnownHttpMethod } from "./utils";
import { addCommonAttributes, addUrlAttributes } from "../../attributes";

export function instrumentFetch() {
  if (!win || !win.fetch || !win.Request) {
    debug("Browser does not support the Fetch API, skipping instrumentation");
    return;
  }
  wrap(win, "fetch", wrapFetch);
}

// eslint-disable-next-line no-restricted-globals -- only used as type here
function wrapFetch(original: typeof fetch) {
  return async function fetchWithInstrumentation(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let copyOfInit = init ? Object.assign({}, init) : init;

    let body: BodyInit | null = null;
    if (copyOfInit?.body) {
      body = copyOfInit.body;
      copyOfInit.body = undefined;
    }

    const request = new Request(input, copyOfInit);
    if (body && copyOfInit) {
      copyOfInit.body = body;
    }

    const url = request.url;
    if (isUrlIgnored(url)) {
      debug(`Not creating span for fetch call because the url is ignored, URL: ${url}`);
      return original(input instanceof Request ? request : input, init);
    }

    // https://fetch.spec.whatwg.org/#concept-request-method
    // We'll match methods case insensitive here to make the user experience a bit less painful
    const originalMethod = request.method ?? "GET";
    const isWellKnownMethod = isWellKnownHttpMethod(originalMethod);
    const isWellKnownMethodMatchingLeniently = isWellKnownHttpMethod(originalMethod.toUpperCase());
    const method = isWellKnownMethodMatchingLeniently ? originalMethod.toUpperCase() : HTTP_METHOD_OTHER;

    const span = startSpan(`HTTP ${method}`);
    addCommonAttributes(span.attributes);
    addUrlAttributes(span.attributes, url);
    addGraphQlProperties(input, init, span);
    addAttribute(span.attributes, HTTP_REQUEST_METHOD, method);
    if (!isWellKnownMethod) {
      addAttribute(span.attributes, HTTP_REQUEST_METHOD_ORIGINAL, originalMethod);
    }

    const propagatorTypes = determinePropagatorTypes(url);
    const shouldSetCorrelationHeaders = propagatorTypes.length > 0;
    if (shouldSetCorrelationHeaders) {
      if (copyOfInit?.headers) {
        // ensure we have a unified container for the headers
        copyOfInit.headers = new Headers(copyOfInit.headers);
        addTraceContextHttpHeaders(copyOfInit.headers.append, copyOfInit.headers, span, propagatorTypes);
      } else if (input instanceof Request) {
        addTraceContextHttpHeaders(request.headers.append, request.headers, span, propagatorTypes);
      } else {
        if (!copyOfInit) {
          copyOfInit = {};
        }
        copyOfInit.headers = new Headers();
        addTraceContextHttpHeaders(copyOfInit.headers.append, copyOfInit.headers, span, propagatorTypes);
      }
    }

    tryCaptureHttpHeaders(request.headers, span, (k) => httpRequestHeaderKey(k));

    const performanceObserver = observeResourcePerformance({
      // We match on both fetch and XHR here to support polyfills
      resourceMatcher: ({ initiatorType, name }) =>
        (initiatorType === "fetch" || initiatorType === "xmlhttprequest") && name === parseUrl(url).href,
      maxWaitForResourceMillis: vars.maxWaitForResourceTimingsMillis,
      maxToleranceForResourceTimingsMillis: vars.maxToleranceForResourceTimingsMillis,
      onEnd: ({ duration, resource }) => {
        if (resource) {
          addResourceNetworkEvents(span, resource);
          addResourceSize(span, resource);
        }
        // duration is millis we need to convert to nanos
        sendSpan(endSpan(span, undefined, duration * 1000000));
      },
    });

    performanceObserver.start();
    try {
      const origResponse = await original(input instanceof Request ? request : input, copyOfInit);
      addResponseData(span, origResponse);

      return wrapResponse(
        origResponse,
        vars.maxToleranceForResourceTimingsMillis,
        () => performanceObserver.end(),
        (e) => {
          performanceObserver.cancel();
          endSpanOnError(span, e);
        }
      );
    } catch (e) {
      performanceObserver.cancel();
      endSpanOnError(span, e as Exception);
      throw e;
    }
  };
}

// @ts-expect-error -- WIP
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP
function addGraphQlProperties(input: RequestInfo | URL, init?: RequestInit, span: InProgressSpan) {
  try {
    if (!isGraphQLQuery(input, init)) return;
  } catch (e) {
    debug("failed to analyze request for GraphQL insights", e, input, init);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP
function isGraphQLQuery(input: RequestInfo | URL, init?: RequestInit) {
  /**
   * TODO: Add GraphQL support.
   * GraphQL queries are either POST or GET requests.
   * Identified by either setting Accept=application/graphql-response+json or the url matching a config field for graphql urls.
   * See: https://graphql.github.io/graphql-over-http/draft/
   * GET requests are queries carrying a query search param
   * POST requests are either queries or mutations, See: https://graphql.org/learn/serving-over-http/#post-request-and-body
   * and https://github.com/instana/weasel/blob/main/lib/hooks/Fetch.ts#L201
   */
  return false;
}

function tryCaptureHttpHeaders(headers: Headers, span: InProgressSpan, getAttributeKey: (headerKey: string) => string) {
  try {
    headers.forEach((value, key) => {
      if (vars.headersToCapture.some((rxp) => rxp.test(key))) {
        addAttribute(span.attributes, getAttributeKey(key), value);
      }
    });
  } catch (_e) {
    debug("unable to capture http headers due to CORS policy");
  }
}

function addResponseData(span: InProgressSpan, response: Response) {
  const status = response.status;
  setSpanStatus(span, status >= 200 && status < 400 ? SPAN_STATUS_UNSET : SPAN_STATUS_ERROR);
  if (status === 0) {
    addAttribute(span.attributes, ERROR_TYPE, response.type);
  }
  addAttribute(span.attributes, HTTP_RESPONSE_STATUS_CODE, String(status));
  tryCaptureHttpHeaders(response.headers, span, (k) => httpResponseHeaderKey(k));
}

/**
 * Wraps the response to be able to detect when it is fully read
 * @param originalResponse
 * @param readTimeoutMs Timeout applied between reading of response chunks, if exceeded the response is considered abandoned and onDone is called.
 * @param onDone Called when the response is completely read or with "fallbackEndTs" when reading timed out.
 * @param onError
 */
function wrapResponse(
  originalResponse: Response,
  readTimeoutMs: number,
  onDone: (fallbackEndTs?: number) => void,
  onError: (e: Exception) => void
): Response {
  // When the response was wrapped (i.e. first available to js) we use this to replace or find the actual end timestamp
  // in case the response body is never read by js
  let fallbackTs: number = perf.now();
  const body = originalResponse.body;

  // For some reason browsers return a response body on responses that can't be constructed with one. In that case we can't wrap the body stream
  if (!body || !responseCanHaveBody(originalResponse)) {
    onDone();
    return originalResponse;
  }

  let cbCalled: boolean = false;
  const handleDone = (fallbackEndTs?: number) => {
    if (cbCalled) return;
    onDone(fallbackEndTs);
    cbCalled = true;
  };
  const handleError = (e: Exception) => {
    if (cbCalled) return;
    onError(e);
    cbCalled = true;
  };

  let bodyNeverCompletelyReadTimeout = setTimeout(() => handleDone(fallbackTs), readTimeoutMs);

  const reader = body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        clearTimeout(bodyNeverCompletelyReadTimeout);
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          controller.close();
          handleDone();
        } else {
          fallbackTs = perf.now();
          bodyNeverCompletelyReadTimeout = setTimeout(() => handleDone(fallbackTs), readTimeoutMs);
          controller.enqueue(value);
        }
      } catch (e) {
        handleError(e as Exception);
        controller.error(e);

        try {
          reader.releaseLock();
        } catch {
          // Spec reference:
          // https://streams.spec.whatwg.org/#default-reader-release-lock
          //
          // releaseLock() only throws if called on an invalid reader
          // (i.e. reader.[[stream]] is undefined, meaning the lock is already released
          // or the reader was never associated). In normal use this cannot happen.
          // This catch is defensive only.
        }
      }
    },
    cancel(reason) {
      clearTimeout(bodyNeverCompletelyReadTimeout);
      handleDone();
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: originalResponse.headers,
  });
}

function endSpanOnError(span: InProgressSpan, error: Exception) {
  recordException(span, error);
  sendSpan(endSpan(span, errorToSpanStatus(error), undefined));
}

function determinePropagatorTypes(url: string): PropagatorType[] {
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

function addTraceContextHttpHeaders(
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

function responseCanHaveBody(response: Response) {
  const status = response.status;
  return status >= 200 && status != 204 && status != 205 && status != 304;
}
