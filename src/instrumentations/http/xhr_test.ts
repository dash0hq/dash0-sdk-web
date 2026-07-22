import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { instrumentXhr } from "./xhr";
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
    this.requestHeaders[name] = value;
  }

  send(body?: unknown) {
    this.sentBody = body;
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
  });

  it("is safe to call instrumentXhr() twice (double-instrumentation guard)", async () => {
    instrumentXhr();
    instrumentXhr();

    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/api/test");
    xhr.send();
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
});
