import { debug, observeResourcePerformance, win } from "../../utils";
import { isAlreadyInstrumented, markAsInstrumented } from "../../utils/is-already-instrumented";
import { isUrlIgnored, matchesAny } from "../../utils/ignore-rules";
import {
  addAttribute,
  setSpanStatus,
  addTraceContextHttpHeaders,
  endSpan,
  errorToSpanStatus,
  Exception,
  InProgressSpan,
  recordException,
  removeAttribute,
  startSpan,
} from "../../utils/otel";
import { addCommonSignalAttributes } from "../../add-common-signal-attributes";
import {
  COMPONENT,
  HTTP_REQUEST_METHOD,
  HTTP_REQUEST_METHOD_ORIGINAL,
  HTTP_RESPONSE_STATUS_CODE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_UNSET,
  URL_FRAGMENT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
} from "../../semantic-conventions";
import { isSameOrigin, parseUrl } from "../../utils/origin";
import { vars } from "../../vars";
import { httpRequestHeaderKey, httpResponseHeaderKey } from "../../utils/otel/http";
import { sendSpan } from "../../transport";
import { addResourceNetworkEvents, addResourceSize, HTTP_METHOD_OTHER, isWellKnownHttpMethod } from "./utils";

export function instrumentFetch() {
  if (!win || !win.fetch || !win.Request) {
    debug("Browser does not support the Fetch API, skipping instrumentation");
    return;
  }

  const originalFetch = win.fetch;

  if (isAlreadyInstrumented(originalFetch)) {
    debug("Fetch is already instrumented by dash0, skipping instrumentation");
    return;
  }

  async function fetchWithInstrumentation(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
      return originalFetch(input instanceof Request ? request : input, init);
    }

    // https://fetch.spec.whatwg.org/#concept-request-method
    const originalMethod = copyOfInit?.method ?? "GET";
    const isWellKnownMethod = isWellKnownHttpMethod(originalMethod);
    const method = isWellKnownMethod ? originalMethod : HTTP_METHOD_OTHER;

    const span = startSpan(`HTTP ${method}`);
    addCommonSignalAttributes(span.attributes);
    addGraphQlProperties(input, init, span);
    addAttribute(span.attributes, COMPONENT, "fetch");
    addAttribute(span.attributes, HTTP_REQUEST_METHOD, method);
    if (!isWellKnownMethod) {
      addAttribute(span.attributes, HTTP_REQUEST_METHOD_ORIGINAL, originalMethod);
    }
    addUrlAttributes(span, url);

    const shouldSetCorrelationHeaders = isSameOrigin(url) || matchesAny(vars.propagateTraceHeadersCorsURLs, url);
    if (shouldSetCorrelationHeaders) {
      if (copyOfInit?.headers) {
        // ensure we have a unified container for the headers
        copyOfInit.headers = new Headers(copyOfInit.headers);
        addTraceContextHttpHeaders(copyOfInit.headers.append, copyOfInit.headers, span);
      } else if (input instanceof Request) {
        addTraceContextHttpHeaders(request.headers.append, request.headers, span);
      } else {
        if (!copyOfInit) {
          copyOfInit = {};
        }
        copyOfInit.headers = new Headers();
        addTraceContextHttpHeaders(copyOfInit.headers.append, copyOfInit.headers, span);
      }
    }

    tryCaptureHttpHeaders(request.headers, span, (k) => httpRequestHeaderKey(k));

    const performanceObserver = observeResourcePerformance({
      // We match on both fetch and XHR here to support polyfills
      resourceMatcher: ({ initiatorType, name }) =>
        initiatorType === "fetch" || (initiatorType === "xmlhttprequest" && name === parseUrl(url).href),
      maxWaitForResourceMillis: vars.maxWaitForResourceTimingsMillis,
      maxToleranceForResourceTimingsMillis: vars.maxToleranceForResourceTimingsMillis,
      onEnd: ({ duration, resource }) => {
        // TODO: add child span for CORS preflight
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
      const response = await originalFetch(input instanceof Request ? request : input, copyOfInit);
      addResponseData(span, response);

      // We use a separate promise here because this needs to happen in parallel to application code consuming the response
      waitForFullResponse(response)
        .then(() => performanceObserver.end())
        .catch((e) => {
          performanceObserver.cancel();
          endSpanOnError(span, e as Exception);
        });

      return response;
    } catch (e) {
      performanceObserver.cancel();
      endSpanOnError(span, e as Exception);
      throw e;
    }
  }

  markAsInstrumented(fetchWithInstrumentation);
  win.fetch = fetchWithInstrumentation;
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
  setSpanStatus(span, status >= 200 && status < 400 ? SPAN_STATUS_UNSET : SPAN_STATUS_ERROR, response.statusText);
  addAttribute(span.attributes, HTTP_RESPONSE_STATUS_CODE, String(status));
  tryCaptureHttpHeaders(response.headers, span, (k) => httpResponseHeaderKey(k));
}

function addUrlAttributes(span: InProgressSpan, url: string) {
  // url.full is already set to browser location with the common attributes
  removeAttribute(span.attributes, URL_FULL);

  try {
    const parsed = parseUrl(url);
    if (parsed.username) parsed.username = "REDACTED";
    if (parsed.password) parsed.password = "REDACTED";

    addAttribute(span.attributes, URL_FULL, parsed.href);
    addAttribute(span.attributes, URL_PATH, parsed.pathname);
    addAttribute(span.attributes, URL_SCHEME, parsed.protocol.replace(":", ""));
    if (parsed.hash) {
      addAttribute(span.attributes, URL_FRAGMENT, parsed.hash.replace("#", ""));
    }
    if (parsed.search) {
      addAttribute(span.attributes, URL_QUERY, parsed.search.replace("?", ""));
    }
  } catch (_e) {
    /* Nothing to do if parsing fails */
  }
}

function waitForFullResponse(response: Response): Promise<void> {
  return new Promise((resolve) => {
    const clonedResponse = response.clone();
    const body = clonedResponse.body;

    if (!body) return resolve();

    const reader = body.getReader();
    const read = async () => {
      const { done } = await reader.read();
      if (done) return resolve();
      return read();
    };
    return read();
  });
}

function endSpanOnError(span: InProgressSpan, error: Exception) {
  recordException(span, error);
  sendSpan(endSpan(span, errorToSpanStatus(error), undefined));
}
