import { expect, vi, beforeEach, afterEach } from "vitest";
import { vars } from "../../vars";
import { instrumentFetch } from "./fetch";
import { sendSpan } from "../../transport";
import type { Span } from "../../types/otlp";
import { USER_INTERACTION_ID, USER_INTERACTION_NAME } from "../../semantic-conventions";
import { clearActiveInteractionForTests, registerActiveInteraction } from "../interactions/active-interaction";

vi.mock("../../transport", () => ({
  sendSpan: vi.fn(),
}));

describe("fetch test", () => {
  let fetchMock: any;

  const sendSpanMock = sendSpan as unknown as ReturnType<typeof vi.fn>;

  const lastSpan = (): Span => {
    const calls = sendSpanMock.mock.calls;
    return calls[calls.length - 1]![0] as Span;
  };

  const hasAttribute = (span: Span, key: string, expectedValue: unknown) =>
    span.attributes.some((a) => a.key === key && JSON.stringify(a.value) === JSON.stringify(expectedValue));

  const hasAttributeKey = (span: Span, key: string) => span.attributes.some((a) => a.key === key);

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
    const NativeRequest = Request;

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

  // Drives a real fetch call through the instrumentation so the addInteractionAttributes() call
  // site in onFetchStart() is actually reached -- asserting on addInteractionAttributes() in
  // isolation (see interaction-attribution_test.ts) would stay green even if the call moved to an
  // unreachable branch.
  describe("interaction attribution", () => {
    beforeEach(() => {
      sendSpanMock.mockClear();
      // The success path completes the span through observeResourcePerformance, which resolves
      // asynchronously. Holding the wait at 0 keeps these tests fast; see the equivalent comment
      // in xhr_test.ts.
      vars.maxWaitForResourceTimingsMillis = 0;
    });

    afterEach(() => {
      clearActiveInteractionForTests();
      vars.maxWaitForResourceTimingsMillis = 10000;
    });

    async function fetchAndAwaitSpan(): Promise<Span> {
      instrumentFetch();
      // eslint-disable-next-line no-restricted-globals
      await fetch("http://localhost:3000/api/test");

      await vi.waitFor(() => expect(sendSpanMock).toHaveBeenCalledTimes(1));
      return lastSpan();
    }

    it("stamps the active interaction onto the fetch span", async () => {
      const interaction = registerActiveInteraction("Save Part");

      const span = await fetchAndAwaitSpan();

      expect(hasAttribute(span, USER_INTERACTION_ID, { stringValue: interaction.id })).toBe(true);
      expect(hasAttribute(span, USER_INTERACTION_NAME, { stringValue: "Save Part" })).toBe(true);
    });

    it("leaves the fetch span unattributed when no interaction is active", async () => {
      const span = await fetchAndAwaitSpan();

      expect(hasAttributeKey(span, USER_INTERACTION_ID)).toBe(false);
      expect(hasAttributeKey(span, USER_INTERACTION_NAME)).toBe(false);
    });

    it("leaves the fetch span unattributed once the attribution window has elapsed", async () => {
      // Back-date the registration instead of freezing the clock for the whole test: vi.waitFor
      // below relies on real time passing. active-interaction.ts is the SDK's only Date.now()
      // consumer (span timestamps go through new Date().getTime() in utils/time.ts), so this
      // shifts nothing else.
      const t0 = Date.now();
      const nowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(t0 - 2001);
      registerActiveInteraction("Save Part");
      nowSpy.mockRestore();

      const span = await fetchAndAwaitSpan();

      expect(hasAttributeKey(span, USER_INTERACTION_ID)).toBe(false);
      expect(hasAttributeKey(span, USER_INTERACTION_NAME)).toBe(false);
    });
  });
});
