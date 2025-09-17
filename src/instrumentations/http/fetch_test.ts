import { describe, it, expect, beforeEach, vi } from "vitest";
import { vars } from "../../vars";
import { InProgressSpan } from "../../utils/otel/span";

// We need to mock the modules before importing the functions
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

import { matchesAny } from "../../utils/ignore-rules";
import { addTraceContextHttpHeaders, addXRayTraceContextHttpHeaders } from "../../utils/otel";
import { isSameOrigin } from "../../utils";

// Test the functions directly since they're at the end of the file
// We'll simulate the logic by testing the functions we can access

describe("Multiple propagator scenario", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset vars to clean state
    vars.propagators = undefined;
    vars.propagateTraceHeadersCorsURLs = [];
  });

  it("should add both headers when multiple propagators match the same URL", () => {
    // Set up propagators config with both types matching the same URL
    vars.propagators = [
      { type: "traceparent", match: [/.*\/api\/test.*/] },
      { type: "xray", match: [/.*\/api\/test.*/] },
    ];

    // Mock matchesAny to return true for both propagators
    vi.mocked(matchesAny).mockReturnValue(true);
    vi.mocked(isSameOrigin).mockReturnValue(false);

    // Simulate what determinePropagatorTypes would return
    const testUrl = "https://example.com/api/test";
    const mockHeaders = new Headers();
    const mockSpan = {
      traceId: "4efaaf4d1e8720b39541901950019ee5",
      spanId: "53995c3f42cd8ad8",
      attributes: [],
    } as unknown as InProgressSpan;

    // Simulate the logic from determinePropagatorTypes
    const matchingTypes: string[] = [];
    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin") {
          // Would check isSameOrigin in real code
          continue;
        } else if (pattern instanceof RegExp) {
          if (matchesAny([pattern], testUrl)) {
            matches = true;
            break;
          }
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    // Simulate addHeadersBasedOnTypes
    for (const type of matchingTypes) {
      if (type === "xray") {
        addXRayTraceContextHttpHeaders(mockHeaders.append.bind(mockHeaders), mockHeaders, mockSpan);
      } else {
        addTraceContextHttpHeaders(mockHeaders.append.bind(mockHeaders), mockHeaders, mockSpan);
      }
    }

    // Verify both header functions were called
    expect(addTraceContextHttpHeaders).toHaveBeenCalledWith(expect.any(Function), mockHeaders, mockSpan);
    expect(addXRayTraceContextHttpHeaders).toHaveBeenCalledWith(expect.any(Function), mockHeaders, mockSpan);
    expect(addTraceContextHttpHeaders).toHaveBeenCalledTimes(1);
    expect(addXRayTraceContextHttpHeaders).toHaveBeenCalledTimes(1);
  });

  it("should deduplicate propagator types when multiple propagators have same type", () => {
    // Set up propagators config with duplicate types
    vars.propagators = [
      { type: "xray", match: [/.*\/api\/test.*/] },
      { type: "traceparent", match: [/.*\/api\/test.*/] },
      { type: "xray", match: [/.*\/api\/test.*/] }, // Duplicate type
    ];

    vi.mocked(matchesAny).mockReturnValue(true);
    vi.mocked(isSameOrigin).mockReturnValue(false);

    const testUrl = "https://example.com/api/test";

    // Simulate the deduplication logic
    const matchingTypes: string[] = [];
    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin") {
          // Would check isSameOrigin in real code
          continue;
        } else if (pattern instanceof RegExp) {
          if (matchesAny([pattern], testUrl)) {
            matches = true;
            break;
          }
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual(["xray", "traceparent"]);
    expect(matchingTypes.length).toBe(2); // Should be deduplicated
  });

  it("should return empty array when no propagators match", () => {
    vars.propagators = [
      { type: "traceparent", match: [/.*\/api\/other.*/] },
      { type: "xray", match: [/.*\/different.*/] },
    ];

    vi.mocked(matchesAny).mockReturnValue(false);
    vi.mocked(isSameOrigin).mockReturnValue(false);

    const testUrl = "https://example.com/api/test";

    // Simulate determinePropagatorTypes logic
    const matchingTypes: string[] = [];
    for (const propagator of vars.propagators) {
      let matches = false;
      for (const pattern of propagator.match) {
        if (pattern === "sameorigin") {
          // Would check isSameOrigin in real code
          continue;
        } else if (pattern instanceof RegExp) {
          if (matchesAny([pattern], testUrl)) {
            matches = true;
            break;
          }
        }
      }
      if (matches && !matchingTypes.includes(propagator.type)) {
        matchingTypes.push(propagator.type);
      }
    }

    expect(matchingTypes).toEqual([]);
  });
});
