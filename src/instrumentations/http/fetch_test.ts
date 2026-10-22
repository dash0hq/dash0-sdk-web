import { expect, vi, beforeEach, afterEach } from "vitest";
import { vars } from "../../vars";
import { instrumentFetch } from "./fetch";
import { sendSpan } from "../../transport";
import type { Span } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendSpan: vi.fn(),
}));

describe("fetch test", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn(() => ({
      ok: false,
      headers: new Headers(),
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { origin: "http://localhost:3000" });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vars.propagators = undefined;
    vars.ignoreUrls = [];
  });

  it("should inject traceparent header for cross-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
  });

  it("should inject xray header for cross-origin requests", async () => {
    vars.propagators = [
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject both headers for cross-origin requests when both match", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
  });

  it("should inject no headers for non-matching cross-origin requests", async () => {
    vars.propagators = [];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const expectedHeaders = undefined;
    expect(fetchMock).toHaveBeenCalledWith("http://foo.bar/foo", expectedHeaders);
  });

  // New same-origin behavior tests
  it("should inject all configured propagator headers for same-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")], // Doesn't match same-origin
      },
      {
        type: "xray",
        match: [new RegExp("http://baz.com/")], // Doesn't match same-origin
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Both headers should be present for same-origin, regardless of match patterns
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject only traceparent for same-origin when only traceparent propagator configured", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });

  it("should inject both traceparent and xray for same-origin when only xray propagator configured", async () => {
    vars.propagators = [
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Same-origin always gets traceparent + all configured propagator types
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject traceparent for same-origin when default traceparent propagator configured", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [], // Empty match array - matches no cross-origin URLs but same-origin gets all propagators
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Same-origin gets all configured propagator types
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });

  it("should follow cross-origin pattern matching for non-same-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
      {
        type: "xray",
        match: [new RegExp("http://baz.com/")],
      },
    ];
    instrumentFetch();
    // Cross-origin request that matches only traceparent pattern
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/api");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });

  // SDK-internal errors (e.g. config typos) must degrade to an uninstrumented fetch call, never
  // to a rejected promise the page did not cause.

  it("falls back to an uninstrumented fetch when ignoreUrls contains plain strings instead of RegExps", async () => {
    vars.ignoreUrls = ["/health"] as unknown as RegExp[];
    instrumentFetch();

    // eslint-disable-next-line no-restricted-globals
    await expect(fetch("http://localhost:3000/health")).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:3000/health");
    expect(fetchMock.mock.calls[0]![1]).toBeUndefined();
    expect(sendSpan).not.toHaveBeenCalled();
  });

  it("falls back to an uninstrumented fetch when a propagator match contains plain strings instead of RegExps", async () => {
    vars.propagators = [{ type: "traceparent", match: ["http://foo.bar/"] as unknown as RegExp[] }];
    instrumentFetch();

    // eslint-disable-next-line no-restricted-globals
    await expect(fetch("http://foo.bar/foo")).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![1]).toBeUndefined();
    expect(sendSpan).not.toHaveBeenCalled();
  });

  describe("aborted requests", () => {
    const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;
    const NativeRequest = Request;

    const lastSpan = (): Span => {
      const calls = sendSpanMock.mock.calls;
      return calls[calls.length - 1]![0] as Span;
    };

    const hasAttribute = (span: Span, key: string, expectedValue: unknown) =>
      span.attributes.some((a) => a.key === key && JSON.stringify(a.value) === JSON.stringify(expectedValue));

    beforeEach(() => {
      sendSpanMock.mockClear();
      // jsdom's Request rejects its own AbortSignal instances (known jsdom bug).
      // Stub Request with a minimal implementation that preserves signals verbatim.
      class FakeRequest {
        url: string;
        method: string;
        headers: Headers;
        signal: AbortSignal | undefined;
        constructor(input: string | FakeRequest, init?: RequestInit) {
          if (input instanceof FakeRequest) {
            this.url = input.url;
            this.method = init?.method ?? input.method;
            this.headers = new Headers(init?.headers ?? input.headers);
            this.signal = init?.signal ?? input.signal;
          } else {
            this.url = String(input);
            this.method = init?.method ?? "GET";
            this.headers = new Headers(init?.headers);
            this.signal = init?.signal ?? undefined;
          }
        }
      }
      vi.stubGlobal("Request", FakeRequest);
    });

    afterEach(() => {
      vi.stubGlobal("Request", NativeRequest);
    });

    it("marks fetch as cancelled when the abort signal fires before the response arrives", async () => {
      const controller = new AbortController();
      fetchMock.mockImplementation(
        (_input: RequestInfo, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(new DOMException("aborted", "AbortError"));
              return;
            }
            signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      );

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      const pending = fetch("http://localhost:3000/api/test", { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(DOMException);

      expect(sendSpanMock).toHaveBeenCalledTimes(1);
      const span = lastSpan();
      expect(span.status?.code).toBe(0);
      expect(span.status?.message).toBeUndefined();
      expect(hasAttribute(span, "dash0.web.request.cancelled", { boolValue: true })).toBe(true);
      expect(span.events.find((e) => e.name === "exception")).toBeUndefined();
    });

    it("marks fetch as cancelled when the abort signal fires while reading the response body", async () => {
      const controller = new AbortController();
      const body = new ReadableStream({
        start(streamController) {
          streamController.enqueue(new Uint8Array([0x68, 0x69]));
          controller.signal.addEventListener("abort", () => {
            streamController.error(new DOMException("aborted", "AbortError"));
          });
        },
      });

      fetchMock.mockImplementation(() => Promise.resolve(new Response(body, { status: 200 })));

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch("http://localhost:3000/api/test", { signal: controller.signal });
      const reader = response.body!.getReader();
      await reader.read();
      controller.abort();
      await expect(reader.read()).rejects.toBeInstanceOf(DOMException);

      expect(sendSpanMock).toHaveBeenCalledTimes(1);
      const span = lastSpan();
      // status was set from the 200 response and should not be overwritten
      expect(span.status?.code).toBe(0);
      expect(span.status?.message).toBeUndefined();
      expect(hasAttribute(span, "dash0.web.request.cancelled", { boolValue: true })).toBe(true);
      expect(hasAttribute(span, "http.response.status_code", { stringValue: "200" })).toBe(true);
      expect(span.events.find((e) => e.name === "exception")).toBeUndefined();
    });

    it("still treats non-abort rejections as failures", async () => {
      fetchMock.mockImplementation(() => Promise.reject(new TypeError("network down")));

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      await expect(fetch("http://localhost:3000/api/test")).rejects.toBeInstanceOf(TypeError);

      expect(sendSpanMock).toHaveBeenCalledTimes(1);
      const span = lastSpan();
      expect(span.status?.code).toBe(2);
      expect(span.status?.message).toBe("network down");
      expect(hasAttribute(span, "dash0.web.request.cancelled", { boolValue: true })).toBe(false);
      expect(span.events.some((e) => e.name === "exception")).toBe(true);
      expect(hasAttribute(span, "error.type", { stringValue: "TypeError" })).toBe(true);
    });

    it("scrubs the request url in the exception message and span status", async () => {
      const originalScrubber = vars.urlAttributeScrubber;
      vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.full": `[${attrs["url.full"].split("?")[0]}]` });
      fetchMock.mockImplementation(() =>
        Promise.reject(new TypeError("Failed to load 'http://localhost:3000/api/test?token=secret'"))
      );

      try {
        instrumentFetch();
        // eslint-disable-next-line no-restricted-globals
        await expect(fetch("http://localhost:3000/api/test?token=secret")).rejects.toBeInstanceOf(TypeError);
      } finally {
        vars.urlAttributeScrubber = originalScrubber;
      }

      const span = lastSpan();
      expect(span.status?.message).toBe("Failed to load '[http://localhost:3000/api/test]'");
      const exception = span.events.find((e) => e.name === "exception")!;
      expect(exception.attributes).toContainEqual({
        key: "exception.message",
        value: { stringValue: "Failed to load '[http://localhost:3000/api/test]'" },
      });
    });

    it("keeps the custom text of a rejection without a message as span status", async () => {
      fetchMock.mockImplementation(() => Promise.reject({ toString: () => "net down" }));

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      await expect(fetch("http://localhost:3000/api/test")).rejects.toBeDefined();

      expect(lastSpan().status?.message).toBe("net down");
    });

    it("passes on rejections with a non-string message unchanged", async () => {
      const rejection = { name: "CustomError", message: 42 };
      fetchMock.mockImplementation(() => Promise.reject(rejection));

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      await expect(fetch("http://localhost:3000/api/test")).rejects.toBe(rejection);

      expect(sendSpanMock).toHaveBeenCalledTimes(1);
    });

    it("sets error.type from the exception name when reading the response body fails", async () => {
      const body = new ReadableStream({
        start(streamController) {
          streamController.enqueue(new Uint8Array([0x68, 0x69]));
        },
        pull(streamController) {
          streamController.error(new TypeError("network down"));
        },
      });

      fetchMock.mockImplementation(() => Promise.resolve(new Response(body, { status: 200 })));

      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch("http://localhost:3000/api/test");
      const reader = response.body!.getReader();
      await reader.read();
      await expect(reader.read()).rejects.toBeInstanceOf(TypeError);

      expect(sendSpanMock).toHaveBeenCalledTimes(1);
      const span = lastSpan();
      expect(span.status?.code).toBe(2);
      expect(span.status?.message).toBe("network down");
      expect(hasAttribute(span, "dash0.web.request.cancelled", { boolValue: true })).toBe(false);
      expect(span.events.some((e) => e.name === "exception")).toBe(true);
      expect(hasAttribute(span, "error.type", { stringValue: "TypeError" })).toBe(true);
    });
  });

  describe("response identity", () => {
    // A constructed Response cannot be redirected, so the read-only getters are shadowed to stand in
    // for what the browser hands back after following a redirect.
    const redirectedResponse = () => {
      const response = new Response('{"hello":"world"}', {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
      });
      Object.defineProperties(response, {
        url: { value: "http://localhost:3000/landing" },
        redirected: { value: true },
        type: { value: "basic" },
      });
      return response;
    };

    it("preserves url, redirected and type on the wrapped response", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(redirectedResponse()));
      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch("http://localhost:3000/api/submit", { method: "POST", body: "a=1" });

      expect(response.url).toBe("http://localhost:3000/landing");
      expect(response.redirected).toBe(true);
      expect(response.type).toBe("basic");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ hello: "world" });
    });

    it("preserves url, redirected and type on a clone of the wrapped response", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(redirectedResponse()));
      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      const clone = (await fetch("http://localhost:3000/api/submit")).clone();

      expect(clone.url).toBe("http://localhost:3000/landing");
      expect(clone.redirected).toBe(true);
      expect(clone.type).toBe("basic");
      await expect(clone.json()).resolves.toEqual({ hello: "world" });
    });
  });
});
