import { debug, observeResourcePerformance, perf, win, setTimeout, wrap, parseUrl, clearTimeout } from "../../utils";
import { isUrlIgnored } from "../../utils/ignore-rules";
import { addAttribute, endSpan, setSpanStatus, Exception, InProgressSpan, startSpan } from "../../utils/otel";
import {
  ERROR_TYPE,
  HTTP_REQUEST_METHOD,
  HTTP_REQUEST_METHOD_ORIGINAL,
  HTTP_RESPONSE_STATUS_CODE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_UNSET,
} from "../../semantic-conventions";
import { vars } from "../../vars";
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

export function instrumentFetch() {
  if (!win || !win.fetch || !win.Request) {
    debug("Browser does not support the Fetch API, skipping instrumentation");
    return;
  }
  wrap(win, "fetch", wrapFetch);
}

type FetchInstrumentation = {
  copyOfInit?: RequestInit;
  span: InProgressSpan;
  performanceObserver: ReturnType<typeof observeResourcePerformance>;
};

// eslint-disable-next-line no-restricted-globals -- only used as type here
function wrapFetch(original: typeof fetch) {
  return async function fetchWithInstrumentation(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let fetchInput: RequestInfo | URL = input;
    let request: Request | undefined;
    let instrumentation: FetchInstrumentation | undefined;
    try {
      let copyOfInit = init ? Object.assign({}, init) : init;

      let body: BodyInit | null = null;
      if (copyOfInit?.body) {
        body = copyOfInit.body;
        copyOfInit.body = undefined;
      }

      request = new Request(input, copyOfInit);
      if (body && copyOfInit) {
        copyOfInit.body = body;
      }
      // Constructing the Request above disturbs the body of a Request input, so from here on the
      // copy has to be handed to the original fetch in place of the input -- including on the
      // ignored and instrumentation-failure paths below.
      fetchInput = input instanceof Request ? request : input;

      if (isUrlIgnored(request.url)) {
        debug(`Not creating span for fetch call because the url is ignored, URL: ${request.url}`);
        // Note: the rejection of the returned promise does not route through the catch below --
        // only synchronous throws do, so the original fetch cannot be invoked twice.
        return original(fetchInput, init);
      }

      instrumentation = onFetchStart(input, init, request, copyOfInit);
    } catch (e) {
      debug("failed to instrument fetch call", e);
      return original(fetchInput, init);
    }

    const { copyOfInit, span, performanceObserver } = instrumentation;

    try {
      const origResponse = await original(fetchInput, copyOfInit);
      addResponseData(span, origResponse);

      return wrapResponse(
        origResponse,
        vars.maxToleranceForResourceTimingsMillis,
        () => performanceObserver.end(),
        (e) => {
          performanceObserver.cancel();
          if (request?.signal?.aborted) {
            endSpanOnAbort(span);
          } else {
            endSpanOnError(span, e);
          }
        }
      );
    } catch (e) {
      performanceObserver.cancel();
      if (request?.signal?.aborted) {
        endSpanOnAbort(span);
      } else {
        endSpanOnError(span, e as Exception);
      }
      throw e;
    }
  };
}

function onFetchStart(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  request: Request,
  copyOfInit: RequestInit | undefined
): FetchInstrumentation {
  const url = request.url;

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

  return { copyOfInit, span, performanceObserver };
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
    if (!vars.headersToCapture.length) return;

    headers.forEach((value, key) => {
      if (vars.headersToCapture.some((rxp) => rxp.test(key))) {
        addAttribute(span.attributes, getAttributeKey(key), value);
      }
    });
  } catch (e) {
    debug("unable to capture http headers", e);
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

function responseCanHaveBody(response: Response) {
  const status = response.status;
  return status >= 200 && status != 204 && status != 205 && status != 304;
}
