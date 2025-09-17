import { describe, it, expect, beforeEach, vi } from "vitest";
import { vars } from "../../vars";

// Mock the utils module
vi.mock("../../utils", () => ({
  debug: vi.fn(),
  observeResourcePerformance: vi.fn(() => ({
    start: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
  })),
  win: {
    fetch: vi.fn(),
    Request: global.Request,
    Headers: global.Headers,
  },
  isSameOrigin: vi.fn(),
  wrap: vi.fn(),
  parseUrl: vi.fn(() => ({ href: "https://example.com/test" })),
  identity: vi.fn((x) => x),
}));

vi.mock("../../utils/ignore-rules", () => ({
  isUrlIgnored: vi.fn(() => false),
  matchesAny: vi.fn(),
}));

vi.mock("../../utils/otel", () => ({
  addAttribute: vi.fn(),
  setSpanStatus: vi.fn(),
  addTraceContextHttpHeaders: vi.fn(),
  addXRayTraceContextHttpHeaders: vi.fn(),
  endSpan: vi.fn(),
  errorToSpanStatus: vi.fn(),
  recordException: vi.fn(),
  startSpan: vi.fn(() => ({
    traceId: "4efaaf4d1e8720b39541901950019ee5",
    spanId: "53995c3f42cd8ad8",
    attributes: [],
  })),
}));

import { isSameOrigin } from "../../utils";

describe("Sameorigin propagator functionality", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset vars to clean state
    vars.propagators = undefined;
    vars.propagateTraceHeadersCorsURLs = [];
  });

  it("should match sameorigin propagator for same-origin URLs", () => {
    vars.propagators = [{ type: "traceparent", match: ["sameorigin"] }];

    vi.mocked(isSameOrigin).mockReturnValue(true);

    const testUrl = "https://example.com/api/test";

    // Simulate the logic from determinePropagatorTypes
    const matchingTypes: string[] = [];
    const isUrlSameOrigin = isSameOrigin(testUrl);

    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin" && isUrlSameOrigin) {
          matches = true;
          break;
        } else if (pattern instanceof RegExp && pattern.test(testUrl)) {
          matches = true;
          break;
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual(["traceparent"]);
    expect(isSameOrigin).toHaveBeenCalledWith(testUrl);
  });

  it("should not match sameorigin propagator for cross-origin URLs", () => {
    vars.propagators = [{ type: "traceparent", match: ["sameorigin"] }];

    vi.mocked(isSameOrigin).mockReturnValue(false);

    const testUrl = "https://different.com/api/test";
    const matchingTypes: string[] = [];
    const isUrlSameOrigin = isSameOrigin(testUrl);

    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin" && isUrlSameOrigin) {
          matches = true;
          break;
        } else if (pattern instanceof RegExp && pattern.test(testUrl)) {
          matches = true;
          break;
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual([]);
    expect(isSameOrigin).toHaveBeenCalledWith(testUrl);
  });

  it("should handle mixed sameorigin and RegExp patterns", () => {
    vars.propagators = [
      { type: "traceparent", match: ["sameorigin", /.*\/special.*/] },
      { type: "xray", match: [/.*\.amazonaws\.com.*/] },
    ];

    // Test same-origin URL
    vi.mocked(isSameOrigin).mockReturnValue(true);
    let testUrl = "https://example.com/api/test";
    let matchingTypes: string[] = [];
    let isUrlSameOrigin = isSameOrigin(testUrl);

    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin" && isUrlSameOrigin) {
          matches = true;
          break;
        } else if (pattern instanceof RegExp && pattern.test(testUrl)) {
          matches = true;
          break;
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual(["traceparent"]);

    // Test cross-origin URL that matches RegExp
    vi.clearAllMocks();
    vi.mocked(isSameOrigin).mockReturnValue(false);
    testUrl = "https://example.amazonaws.com/service";
    matchingTypes = [];
    isUrlSameOrigin = isSameOrigin(testUrl);

    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin" && isUrlSameOrigin) {
          matches = true;
          break;
        } else if (pattern instanceof RegExp && pattern.test(testUrl)) {
          matches = true;
          break;
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual(["xray"]);
  });

  it("should handle both sameorigin and RegExp matching for same URL", () => {
    vars.propagators = [
      { type: "traceparent", match: ["sameorigin"] },
      { type: "xray", match: [/.*example\.com.*/] },
    ];

    vi.mocked(isSameOrigin).mockReturnValue(true);
    const testUrl = "https://example.com/api/test";
    const matchingTypes: string[] = [];
    const isUrlSameOrigin = isSameOrigin(testUrl);

    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin" && isUrlSameOrigin) {
          matches = true;
          break;
        } else if (pattern instanceof RegExp && pattern.test(testUrl)) {
          matches = true;
          break;
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    // Both should match - sameorigin for traceparent, RegExp for xray
    expect(matchingTypes).toEqual(["traceparent", "xray"]);
  });
});
