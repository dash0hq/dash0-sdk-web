import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { instrumentXhr } from "./xhr";
import { doc } from "../../utils/globals";
import { sendSpan } from "../../transport";
import type { Span } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendSpan: vi.fn(),
}));

/**
 * A controllable stand-in for the browser's XMLHttpRequest. jsdom's own XHR implementation does
 * not give deterministic control over readyState transitions, response headers, or event timing,
 * so we install this fake via vi.stubGlobal and drive it explicitly from each test.
 */
class FakeXMLHttpRequest extends EventTarget {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = 4;

  readyState = FakeXMLHttpRequest.UNSENT;
  status = 0;
  statusText = "";
  responseHeaders: Record<string, string> = {};
  requestHeaders: Record<string, string> = {};
  method?: string;
  url?: string;
  async?: boolean;
  sentBody?: unknown;
  onreadystatechange: (() => void) | null = null;

  open(method: string, url: string, async?: boolean) {
    this.method = method;
    this.url = url;
    this.async = async ?? true;
    this.readyState = FakeXMLHttpRequest.OPENED;
    this.requestHeaders = {};
    this.status = 0;
  }

  setRequestHeader(name: string, value: string) {
    // Per the XHR spec, repeated setRequestHeader() calls with the same name combine the values.
    // Modeling this makes doubled header injection observable as a comma-joined value.
    const existing = this.requestHeaders[name];
    this.requestHeaders[name] = existing ? `${existing}, ${value}` : value;
  }

  /**
   * When set, send() throws this error synchronously without firing any events, modeling the
   * spec's sync-XHR error handling: a network error or timeout on open(..., false) makes send()
   * throw and loadend never fires.
   */
  syncSendError?: Error;

  send(body?: unknown) {
    this.sentBody = body;
    if (this.syncSendError) {
      this.readyState = FakeXMLHttpRequest.DONE;
      throw this.syncSendError;
    }
  }

  getAllResponseHeaders(): string {
    return Object.entries(this.responseHeaders)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join("");
  }

  // --- Test-only helpers to drive the fake through a request lifecycle ---

  respond(status: number, headers: Record<string, string> = {}) {
    this.status = status;
    this.statusText = String(status);
    this.responseHeaders = headers;
    this.readyState = FakeXMLHttpRequest.DONE;
    this.dispatchEvent(new Event("loadend"));
  }

  triggerError() {
    this.status = 0;
    this.readyState = FakeXMLHttpRequest.DONE;
    this.dispatchEvent(new Event("error"));
    this.dispatchEvent(new Event("loadend"));
  }

  triggerTimeout() {
    this.status = 0;
    this.readyState = FakeXMLHttpRequest.DONE;
    this.dispatchEvent(new Event("timeout"));
    this.dispatchEvent(new Event("loadend"));
  }

  triggerAbort() {
    this.status = 0;
    this.readyState = FakeXMLHttpRequest.DONE;
    this.dispatchEvent(new Event("abort"));
    this.dispatchEvent(new Event("loadend"));
  }
}

describe("xhr test", () => {
  let NativeXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    NativeXHR = globalThis.XMLHttpRequest;
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    vi.stubGlobal("location", { origin: "http://localhost:3000", href: "http://localhost:3000/" });
    // Let the async resource-timing wait resolve on the next tick. See the comment on the first
    // success-path test below for why the success path is asynchronous.
    vars.maxWaitForResourceTimingsMillis = 0;
  });

  afterEach(() => {
    vi.stubGlobal("XMLHttpRequest", NativeXHR);
    vi.resetAllMocks();
    vars.propagators = undefined;
    vars.headersToCapture = [];
    vars.ignoreUrls = [];
    vars.maxWaitForResourceTimingsMillis = 10000;
  });

  it("should inject traceparent header for same-origin requests", () => {
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();

    expect(xhr.requestHeaders["traceparent"]).toBeDefined();
  });

  it("should inject traceparent header for matching cross-origin requests", () => {
    vars.propagators = [{ type: "traceparent", match: [new RegExp("http://foo.bar/")] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "http://foo.bar/foo");
    xhr.send();

    expect(xhr.requestHeaders["traceparent"]).toBeDefined();
  });

  it("should inject xray header in X-Ray format for matching cross-origin requests", () => {
    vars.propagators = [{ type: "xray", match: [new RegExp("http://foo.bar/")] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "http://foo.bar/foo");
    xhr.send();

    expect(xhr.requestHeaders["X-Amzn-Trace-Id"]).toMatch(
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=1$/
    );
  });

  it("should inject no headers for non-matching cross-origin requests", () => {
    vars.propagators = [];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "http://foo.bar/foo");
    xhr.send();

    expect(xhr.requestHeaders["traceparent"]).toBeUndefined();
    expect(xhr.requestHeaders["X-Amzn-Trace-Id"]).toBeUndefined();
  });

  it("should not create a span or inject headers for ignored URLs", () => {
    vars.ignoreUrls = [/you-cant-see-this/];
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/you-cant-see-this");
    xhr.send();

    expect(xhr.requestHeaders["traceparent"]).toBeUndefined();
    expect(sendSpan).not.toHaveBeenCalled();
  });

  // Ignore rules must match against the resolved absolute URL -- the same form the fetch
  // instrumentation matches against -- so origin-anchored regexes apply uniformly to relative
  // XHR URLs.
  it("should apply origin-anchored ignore regexes to relative URLs", () => {
    const origin = new URL(doc!.baseURI).origin;
    vars.ignoreUrls = [new RegExp(`^${origin}/you-cant-see-this`)];
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/you-cant-see-this");
    xhr.send();

    expect(xhr.requestHeaders["traceparent"]).toBeUndefined();
    expect(sendSpan).not.toHaveBeenCalled();
    // The page's own request must still have gone through with the original relative URL.
    expect(xhr.url).toBe("/you-cant-see-this");
  });

  it("records the resolved absolute URL as url.full for relative request URLs", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).toContainEqual({
      key: "url.full",
      value: { stringValue: new URL("/api/test", doc!.baseURI).href },
    });
    // The native open() must still have received the page's original relative URL.
    expect(xhr.url).toBe("/api/test");
  });

  // The tests below that drive a request to *successful* completion must await sendSpan
  // asynchronously: the success path routes span completion through observeResourcePerformance,
  // which resolves asynchronously. jsdom's PerformanceObserver never emits resource entries, so
  // onEnd only fires after the maxWaitForResourceTimingsMillis timeout -- held at 0 in these tests
  // (see beforeEach) to keep them fast. The error/timeout/abort paths bypass the observer and
  // remain synchronous.
  it("should capture matching request headers as span attributes", async () => {
    vars.headersToCapture = [/x-test-header/];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("x-test-header", "hello");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).toContainEqual({
      key: "http.request.header.x-test-header",
      value: { stringValue: "hello" },
    });
  });

  it("does not retain headers set while headersToCapture is empty", async () => {
    vars.headersToCapture = [];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("x-test-header", "hello");
    // Nothing may have been stored above -- enabling capture afterwards must not resurface it.
    vars.headersToCapture = [/x-test-header/];
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.request.header.x-test-header" }));
  });

  it("combines repeated setRequestHeader calls case-insensitively into a single attribute", async () => {
    vars.headersToCapture = [/x-test-header/];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("X-Test-Header", "a");
    xhr.setRequestHeader("x-test-header", "b");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    const headerAttributes = span.attributes.filter((attr) => attr.key === "http.request.header.x-test-header");
    expect(headerAttributes).toEqual([
      {
        key: "http.request.header.x-test-header",
        value: { stringValue: "a, b" },
      },
    ]);
  });

  it("matches capture regexes against the lowercased header name, like fetch", async () => {
    // Headers iteration yields lowercased names for fetch, so a case-sensitive regex written
    // against the original casing never matches there -- XHR must behave the same.
    vars.headersToCapture = [/^X-Test/];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("X-Test-Header", "hello");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.request.header.x-test-header" }));
  });

  it("does not capture the SDK's own injected trace context headers as span attributes", async () => {
    vars.headersToCapture = [/.*/];
    vars.propagators = [
      { type: "traceparent", match: [] },
      { type: "xray", match: [] },
    ];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();

    // Injection itself must still happen ...
    expect(xhr.requestHeaders["traceparent"]).toBeDefined();
    expect(xhr.requestHeaders["X-Amzn-Trace-Id"]).toBeDefined();

    xhr.respond(200);
    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    // ... but like fetch, the SDK-injected headers must not surface as request-header attributes,
    // even under a catch-all capture pattern.
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.request.header.traceparent" }));
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.request.header.x-amzn-trace-id" }));
  });

  it("skips span creation and injection when a traceparent header is already present (fetch polyfill over XHR)", async () => {
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    // Models a fetch polyfill built on XHR: the fetch instrumentation already created a span and
    // injected trace context for this logical request, and the polyfill replays the headers onto
    // the underlying XHR.
    const existing = "00-4efaaf4d1e8720b39541901950019ee5-53995c3f42cd8ad8-01";
    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("traceparent", existing);
    xhr.send();
    xhr.respond(200);

    // No second injection -- the XHR spec would combine the values into one invalid
    // comma-joined traceparent.
    expect(xhr.requestHeaders["traceparent"]).toBe(existing);
    // And no second span for the same logical request.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sendSpan).not.toHaveBeenCalled();
  });

  it("detects already-present correlation headers case-insensitively and for X-Ray", async () => {
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.setRequestHeader("X-Amzn-Trace-Id", "Root=1-4efaaf4d-1e8720b39541901950019ee5");
    xhr.send();
    xhr.respond(200);

    expect(xhr.requestHeaders["traceparent"]).toBeUndefined();

    const xhr2 = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr2.open("GET", "/api/test");
    xhr2.setRequestHeader("Traceparent", "00-4efaaf4d1e8720b39541901950019ee5-53995c3f42cd8ad8-01");
    xhr2.send();
    xhr2.respond(200);

    expect(xhr2.requestHeaders["traceparent"]).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sendSpan).not.toHaveBeenCalled();
  });

  it("instruments the next request on a reused instance after skipping an already-traced one", async () => {
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/first");
    xhr.setRequestHeader("traceparent", "00-4efaaf4d1e8720b39541901950019ee5-53995c3f42cd8ad8-01");
    xhr.send();
    xhr.respond(200);
    expect(sendSpan).not.toHaveBeenCalled();

    // open() resets the per-request state, so the next request must be traced normally.
    xhr.open("GET", "/api/second");
    xhr.send();
    expect(xhr.requestHeaders["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    xhr.respond(200);
    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
  });

  it("normalizes well-known methods to uppercase and records HTTP_METHOD_OTHER for unknown methods", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("get", "/api/test");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.name).toBe("HTTP GET");
    expect(span.attributes).toContainEqual({ key: "http.request.method", value: { stringValue: "GET" } });

    const xhr2 = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr2.open("FROBNICATE", "/api/test");
    xhr2.send();
    xhr2.respond(200);

    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(2));
    const otherSpan = sendSpanMock.mock.calls[1]![0] as Span;
    expect(otherSpan.name).toBe("HTTP _OTHER");
    expect(otherSpan.attributes).toContainEqual({ key: "http.request.method", value: { stringValue: "_OTHER" } });
    expect(otherSpan.attributes).toContainEqual({
      key: "http.request.method_original",
      value: { stringValue: "FROBNICATE" },
    });
  });

  it("is safe to call instrumentXhr() twice (double-instrumentation guard)", async () => {
    vars.propagators = [{ type: "traceparent", match: [] }];
    instrumentXhr();
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();

    // Double-wrapping would inject traceparent twice, and the XHR spec combines repeated
    // setRequestHeader() values -- the backend would receive one invalid comma-joined header.
    // A single well-formed value proves injection ran exactly once.
    expect(xhr.requestHeaders["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    xhr.respond(200);
    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
  });

  it("ends the span with status UNSET and captures response headers on a successful response", async () => {
    vars.headersToCapture = [/x-response-header/];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200, { "x-response-header": "yes", "content-type": "text/plain" });

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(0);
    expect(span.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "200" },
    });
    expect(span.attributes).toContainEqual({
      key: "http.response.header.x-response-header",
      value: { stringValue: "yes" },
    });
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.response.header.content-type" }));
  });

  it("marks the span as errored (status code ERROR) for a 4xx/5xx response", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(500);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(2);
    expect(span.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "500" },
    });
  });

  it("records an exception and marks the span as errored on a network error", () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.triggerError();

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(2);
    expect(span.events.some((e) => e.name === "exception")).toBe(true);
    expect(span.attributes).toContainEqual({ key: "error.type", value: { stringValue: "error" } });
  });

  it("records an exception and marks the span as errored on a timeout", () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.triggerTimeout();

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(2);
    expect(span.events.some((e) => e.name === "exception")).toBe(true);
    expect(span.attributes).toContainEqual({ key: "error.type", value: { stringValue: "timeout" } });
  });

  it("ends the span as an error and rethrows unchanged when a synchronous send() throws", () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    const removeListenerSpy = vi.spyOn(xhr, "removeEventListener");
    xhr.open("GET", "/api/test", false);
    const networkError = new DOMException("A network error occurred.", "NetworkError");
    xhr.syncSendError = networkError;

    let caught: unknown;
    try {
      xhr.send();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(networkError);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(2);
    expect(span.attributes).toContainEqual({ key: "error.type", value: { stringValue: "error" } });
    expect(span.events.some((e) => e.name === "exception")).toBe(true);

    // The per-request listeners must not leak -- loadend never fires for sync failures.
    expect(removeListenerSpy).toHaveBeenCalledTimes(4);
    expect(removeListenerSpy.mock.calls.map((c) => c[0]).sort()).toEqual(["abort", "error", "loadend", "timeout"]);
  });

  it("classifies a synchronous send() TimeoutError as a timeout", () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test", false);
    xhr.syncSendError = new DOMException("The request timed out.", "TimeoutError");

    expect(() => xhr.send()).toThrow();

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(2);
    expect(span.attributes).toContainEqual({ key: "error.type", value: { stringValue: "timeout" } });
  });

  it("still instruments a subsequent request on the same instance after a synchronous send() failure", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test", false);
    xhr.syncSendError = new DOMException("A network error occurred.", "NetworkError");
    expect(() => xhr.send()).toThrow();

    xhr.syncSendError = undefined;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(2));
    const secondSpan = sendSpanMock.mock.calls[1]![0] as Span;
    expect(secondSpan.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "200" },
    });
  });

  it("marks the span as cancelled (not failed) on abort", () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.triggerAbort();

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.status?.code).toBe(0);
    expect(span.attributes).toContainEqual({
      key: "dash0.web.request.cancelled",
      value: { boolValue: true },
    });
    expect(span.events.find((e) => e.name === "exception")).toBeUndefined();
  });

  it("only completes a span once even if multiple terminal events fire", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200);
    // Simulate a spurious extra loadend (some browsers/polyfills have done this historically)
    xhr.dispatchEvent(new Event("loadend"));

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
  });

  it("treats a reused XHR instance's second open() as a fresh request with its own span", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/first");
    xhr.send();
    xhr.respond(200);

    xhr.open("GET", "/api/second");
    xhr.send();
    xhr.respond(201);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(2));
    expect(sendSpanMock).toHaveBeenCalledTimes(2);
    const firstSpan = sendSpanMock.mock.calls[0]![0] as Span;
    const secondSpan = sendSpanMock.mock.calls[1]![0] as Span;
    expect(firstSpan.spanId).not.toBe(secondSpan.spanId);
    expect(secondSpan.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "201" },
    });
  });

  it("ends the previous span as cancelled when open() is called while a request is in flight", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/first");
    xhr.send();
    // Reopen before the first request completes -- per spec this terminates the in-flight fetch
    // without firing abort/loadend.
    xhr.open("GET", "/api/second");

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    const firstSpan = sendSpanMock.mock.calls[0]![0] as Span;
    expect(firstSpan.attributes).toContainEqual({
      key: "url.full",
      value: { stringValue: "http://localhost:3000/api/first" },
    });
    expect(firstSpan.attributes).toContainEqual({
      key: "dash0.web.request.cancelled",
      value: { boolValue: true },
    });
    expect(firstSpan.attributes.find((a) => a.key === "http.response.status_code")).toBeUndefined();

    xhr.send();
    xhr.respond(200);

    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(2));
    // The second request's completion must end its own span -- the first request's stale loadend
    // listener must not have re-ended the cancelled span with the new request's status.
    const secondSpan = sendSpanMock.mock.calls[1]![0] as Span;
    expect(secondSpan.spanId).not.toBe(firstSpan.spanId);
    expect(secondSpan.attributes).toContainEqual({
      key: "url.full",
      value: { stringValue: "http://localhost:3000/api/second" },
    });
    expect(secondSpan.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "200" },
    });
    expect(sendSpanMock).toHaveBeenCalledTimes(2);
  });

  it("does not create a second span when send() is called twice", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    const addListenerSpy = vi.spyOn(xhr, "addEventListener");
    xhr.open("GET", "/api/test");
    xhr.send();
    // A second send() on an in-flight request throws InvalidStateError natively; the SDK must not
    // create a second span or attach a second set of listeners for it.
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    expect(sendSpanMock).toHaveBeenCalledTimes(1);
    expect(addListenerSpy).toHaveBeenCalledTimes(4);
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { stringValue: "200" },
    });
  });

  it("removes the per-request listeners once the request completes", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    const removeListenerSpy = vi.spyOn(xhr, "removeEventListener");
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));

    expect(removeListenerSpy).toHaveBeenCalledTimes(4);
    expect(removeListenerSpy.mock.calls.map((c) => c[0]).sort()).toEqual(["abort", "error", "loadend", "timeout"]);

    // Spurious late events after completion must not affect the already-sent span...
    xhr.dispatchEvent(new Event("error"));
    xhr.dispatchEvent(new Event("loadend"));
    expect(sendSpanMock).toHaveBeenCalledTimes(1);

    // ...and a subsequent request cycle on the same instance still produces exactly one more span.
    xhr.open("GET", "/api/test");
    xhr.send();
    xhr.respond(200);
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(2));
  });

  // The tests below verify that SDK-internal errors never escape into the page's synchronous
  // open()/send() calls -- a misconfigured SDK must degrade to "no telemetry", never to a
  // page-wide XHR outage.

  it("does not break the page's XHR when ignoreUrls contains plain strings instead of RegExps", () => {
    vars.ignoreUrls = ["/health"] as unknown as RegExp[];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    expect(() => {
      xhr.open("GET", "/health");
      xhr.send("payload");
    }).not.toThrow();

    // The native methods must still have run...
    expect(xhr.url).toBe("/health");
    expect(xhr.sentBody).toBe("payload");
    // ...while the request goes untracked.
    xhr.respond(200);
    expect(sendSpan).not.toHaveBeenCalled();
  });

  it("does not break the page's XHR when a propagator match contains plain strings instead of RegExps", () => {
    vars.propagators = [{ type: "traceparent", match: ["http://foo.bar/"] as unknown as RegExp[] }];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    expect(() => {
      xhr.open("GET", "http://foo.bar/foo");
      xhr.send();
    }).not.toThrow();

    expect(xhr.url).toBe("http://foo.bar/foo");
    xhr.respond(200);
    expect(sendSpan).not.toHaveBeenCalled();
  });

  it("does not break the page's XHR when a header capture matcher throws", async () => {
    vars.headersToCapture = [
      {
        test: () => {
          throw new Error("boom");
        },
      } as unknown as RegExp,
    ];
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    // The matcher throws inside the wrapped setRequestHeader -- the page's call must succeed
    // and the header must still reach the request.
    expect(() => xhr.setRequestHeader("x-test-header", "hello")).not.toThrow();
    expect(() => xhr.send("payload")).not.toThrow();

    expect(xhr.requestHeaders["x-test-header"]).toBe("hello");
    expect(xhr.sentBody).toBe("payload");
    xhr.respond(200);

    // The request is still tracked normally -- only the header capture is skipped.
    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.attributes).not.toContainEqual(expect.objectContaining({ key: "http.request.header.x-test-header" }));
  });

  it("accepts a non-string method just like native XHR does", async () => {
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    expect(() => {
      xhr.open(123 as unknown as string, "/api/test");
      xhr.send();
    }).not.toThrow();
    xhr.respond(200);

    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
    const span = sendSpanMock.mock.calls[0]![0] as Span;
    expect(span.name).toBe("HTTP _OTHER");
    expect(span.attributes).toContainEqual({ key: "http.request.method_original", value: { stringValue: "123" } });
  });

  it("evaluates a custom URL object's toString only once across SDK and native open()", () => {
    instrumentXhr();

    const toString = vi.fn(() => "/api/test");
    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", { toString } as unknown as string);

    expect(toString).toHaveBeenCalledTimes(1);
    expect(xhr.url).toBe("/api/test");
  });

  it("does not throw out of init when the page locked the XMLHttpRequest prototype", () => {
    class LockedXhr extends EventTarget {
      open() {}
      setRequestHeader() {}
      send() {}
    }
    for (const method of ["open", "setRequestHeader", "send"] as const) {
      Object.defineProperty(LockedXhr.prototype, method, {
        value: LockedXhr.prototype[method],
        writable: false,
        configurable: false,
      });
    }
    vi.stubGlobal("XMLHttpRequest", LockedXhr);

    expect(() => instrumentXhr()).not.toThrow();
  });
});
