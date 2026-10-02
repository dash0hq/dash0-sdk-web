import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValue, Span } from "../../types/otlp";
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_BODY_SIZE,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PROTOCOL_NAME,
  RESOURCE_CACHED,
  RESOURCE_DELIVERY_TYPE,
  RESOURCE_INITIATOR_TYPE,
  RESOURCE_RENDER_BLOCKING_STATUS,
  URL_FULL,
} from "../../semantic-conventions";
import { vars } from "../../vars";
import { getTimeOrigin, win } from "../../utils";

vi.mock("../../transport", () => ({
  sendResourceSpan: vi.fn(),
}));

import { sendResourceSpan } from "../../transport";
import { startResourceTimingInstrumentation, stopResourceTimingInstrumentation } from ".";

/**
 * jsdom ships a `PerformanceObserver`, but it never emits resource entries -- the same reason the
 * XHR instrumentation's tests cannot rely on it. This stands in for one so entries can be delivered
 * on demand.
 */
class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];

  observed: PerformanceObserverInit | undefined;
  disconnected = false;

  constructor(readonly callback: (list: PerformanceObserverEntryList) => void) {
    FakePerformanceObserver.instances.push(this);
  }

  observe(options: PerformanceObserverInit) {
    this.observed = options;
  }

  disconnect() {
    this.disconnected = true;
  }

  /** Delivers entries the way the browser would, as an entry list. */
  emit(entries: Partial<PerformanceResourceTiming>[]) {
    this.callback({
      getEntriesByType: () => entries as PerformanceResourceTiming[],
      getEntries: () => entries as PerformanceResourceTiming[],
      getEntriesByName: () => entries as PerformanceResourceTiming[],
    });
  }
}

function entry(overrides: Partial<PerformanceResourceTiming> = {}): Partial<PerformanceResourceTiming> {
  return {
    entryType: "resource",
    name: "https://example.com/assets/main.a81f.js",
    initiatorType: "script",
    startTime: 100,
    duration: 50,
    responseEnd: 150,
    fetchStart: 101,
    domainLookupStart: 102,
    domainLookupEnd: 103,
    connectStart: 103,
    connectEnd: 110,
    secureConnectionStart: 105,
    requestStart: 111,
    responseStart: 140,
    transferSize: 1200,
    encodedBodySize: 1000,
    decodedBodySize: 3000,
    nextHopProtocol: "h2",
    ...overrides,
  };
}

function attr(span: Span, key: string): KeyValue["value"] | undefined {
  return span.attributes.find((a) => a.key === key)?.value;
}

/**
 * The span's duration in nanoseconds. Asserted with a tolerance because `endSpan` adds the duration
 * to the start timestamp as a JS number: nanoseconds since the epoch are around 1.8e18, past the
 * 2^53 integer range of a float64, so timestamps quantise to roughly 256ns. That is inherent to
 * every span the SDK emits and far below anything a load waterfall resolves.
 */
function durationNanos(span: Span): number {
  return Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano);
}

function emitted(): Span[] {
  return vi.mocked(sendResourceSpan).mock.calls.map(([span]) => span as Span);
}

/**
 * Swaps the window's `PerformanceObserver`. Goes through the SDK's own `win` alias rather than the
 * global so the instrumentation and the test are looking at the same object.
 */
function setObserver(observer: unknown): void {
  (win as unknown as Record<string, unknown>)["PerformanceObserver"] = observer;
}

function observerInstance(): FakePerformanceObserver {
  const instance = FakePerformanceObserver.instances[0];
  if (!instance) throw new Error("No PerformanceObserver was constructed");
  return instance;
}

describe("resource timing instrumentation", () => {
  let originalObserver: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    FakePerformanceObserver.instances = [];
    originalObserver = win!.PerformanceObserver;
    setObserver(FakePerformanceObserver);
    vars.ignoreUrls = [];
    vars.endpoints = [];
    vars.resourceTiming = { maxSpansPerPageLoad: 100 };
  });

  afterEach(() => {
    stopResourceTimingInstrumentation();
    setObserver(originalObserver);
  });

  it("observes buffered resource entries and raises the timing buffer", () => {
    const setBufferSize = vi.spyOn(performance, "setResourceTimingBufferSize");

    startResourceTimingInstrumentation();

    expect(setBufferSize).toHaveBeenCalled();
    // Entries recorded before init() are most of the critical path, so the replay is the point.
    expect(observerInstance().observed).toEqual({ type: "resource", buffered: true });
  });

  it("emits a span per static asset with the entry's own start and duration", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([entry()]);

    const spans = emitted();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.name).toBe("script main.a81f.js");
    expect(attr(span, URL_FULL)?.stringValue).toBe("https://example.com/assets/main.a81f.js");
    expect(attr(span, HTTP_REQUEST_METHOD)?.stringValue).toBe("GET");
    expect(attr(span, RESOURCE_INITIATOR_TYPE)?.stringValue).toBe("script");
    expect(attr(span, NETWORK_PROTOCOL_NAME)?.stringValue).toBe("h2");
    expect(attr(span, HTTP_RESPONSE_BODY_SIZE)?.doubleValue).toBe(1000);

    // The span must be anchored to the entry, not to when the observer happened to deliver it.
    const expectedStart = Math.round((100 + getTimeOrigin()) * 1000000);
    expect(span.startTimeUnixNano).toBe(String(expectedStart));
    expect(durationNanos(span)).toBeCloseTo(50 * 1000000, -3);
  });

  it("records the network phases as span events", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([entry()]);

    const names = emitted()[0]!.events.map((e) => e.name);
    expect(names).toContain("domainLookupStart");
    expect(names).toContain("requestStart");
    expect(names).toContain("responseEnd");
  });

  it("skips fetch and XHR entries, which the HTTP instrumentations already cover", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({ initiatorType: "fetch", name: "https://example.com/api/users" }),
      entry({ initiatorType: "xmlhttprequest", name: "https://example.com/api/orders" }),
      entry({ initiatorType: "img", name: "https://example.com/logo.svg" }),
    ]);

    expect(emitted().map((s) => s.name)).toEqual(["img logo.svg"]);
  });

  it("skips ignored urls", () => {
    vars.ignoreUrls = [/\/analytics\//];
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({ name: "https://example.com/analytics/tracker.js" }),
      entry({ name: "https://example.com/app.js" }),
    ]);

    expect(emitted().map((s) => s.name)).toEqual(["script app.js"]);
  });

  it("skips the SDK's own telemetry requests", () => {
    vars.endpoints = [{ url: "https://ingress.dash0.com", authToken: "auth_token" }];
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({ name: "https://ingress.dash0.com/v1/traces", initiatorType: "beacon" }),
      entry({ name: "https://example.com/app.js" }),
    ]);

    expect(emitted().map((s) => s.name)).toEqual(["script app.js"]);
  });

  it("honours an initiatorTypes allow list when one is configured", () => {
    vars.resourceTiming = { initiatorTypes: ["img"], maxSpansPerPageLoad: 100 };
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({ initiatorType: "script" }),
      entry({ initiatorType: "img", name: "https://example.com/logo.svg" }),
    ]);

    expect(emitted().map((s) => s.name)).toEqual(["img logo.svg"]);
  });

  it("stops emitting once maxSpansPerPageLoad is reached", () => {
    vars.resourceTiming = { maxSpansPerPageLoad: 2 };
    startResourceTimingInstrumentation();
    observerInstance().emit([entry(), entry(), entry(), entry()]);

    expect(emitted()).toHaveLength(2);
  });

  it("marks a resource served from cache", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([entry({ transferSize: 0, decodedBodySize: 3000 })]);

    expect(attr(emitted()[0]!, RESOURCE_CACHED)?.boolValue).toBe(true);
  });

  it("does not mark a cross-origin resource as cached", () => {
    // Without Timing-Allow-Origin every size is zeroed, which must not be read as a cache hit.
    startResourceTimingInstrumentation();
    observerInstance().emit([entry({ transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 })]);

    expect(attr(emitted()[0]!, RESOURCE_CACHED)).toBeUndefined();
  });

  it("still emits a usable span for a cross-origin resource with opaque timings", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({
        name: "https://cdn.other.com/font.woff2",
        initiatorType: "css",
        domainLookupStart: 0,
        domainLookupEnd: 0,
        connectStart: 0,
        connectEnd: 0,
        secureConnectionStart: 0,
        requestStart: 0,
        responseStart: 0,
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
        nextHopProtocol: "",
      }),
    ]);

    const span = emitted()[0]!;
    // Ordering and bar length survive; the phase breakdown does not, and must not be faked. Without
    // Timing-Allow-Origin the browser still exposes fetchStart and responseEnd -- it is the DNS,
    // connect and request phases in between that come back as 0 and are dropped here.
    expect(durationNanos(span)).toBeCloseTo(50 * 1000000, -3);
    expect(span.events.map((e) => e.name)).toEqual(["fetchStart", "responseEnd"]);
  });

  it("carries the optional Chromium-only fields when present", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([
      entry({
        ...({ renderBlockingStatus: "blocking", deliveryType: "cache", responseStatus: 200 } as any),
      }),
    ]);

    const span = emitted()[0]!;
    expect(attr(span, RESOURCE_RENDER_BLOCKING_STATUS)?.stringValue).toBe("blocking");
    expect(attr(span, RESOURCE_DELIVERY_TYPE)?.stringValue).toBe("cache");
    expect(attr(span, HTTP_RESPONSE_STATUS_CODE)?.stringValue).toBe("200");
  });

  it("falls back to the marks when the browser reports a nonsense duration", () => {
    startResourceTimingInstrumentation();
    observerInstance().emit([entry({ duration: 1000 * 60 * 60 * 24 * 365, startTime: 100, responseEnd: 180 })]);

    const span = emitted()[0]!;
    expect(durationNanos(span)).toBeCloseTo(80 * 1000000, -3);
  });

  it("does nothing when PerformanceObserver rejects the resource entry type", () => {
    setObserver(
      class {
        observe() {
          throw new Error("entryTypes only contained unsupported types");
        }
        disconnect() {}
      }
    );

    expect(() => startResourceTimingInstrumentation()).not.toThrow();
    expect(emitted()).toHaveLength(0);
  });
});
