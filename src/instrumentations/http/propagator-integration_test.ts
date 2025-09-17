import { describe, it, expect, beforeEach } from "vitest";
import { addW3CTraceContextHttpHeaders, addXRayTraceContextHttpHeaders } from "../../utils/otel/trace-context";
import { InProgressSpan } from "../../utils/otel/span";

describe("Multiple propagator integration", () => {
  let headers: Record<string, string>;
  let mockAppend: (name: string, value: string) => void;
  let mockSpan: InProgressSpan;

  beforeEach(() => {
    headers = {};
    mockAppend = (name: string, value: string) => {
      headers[name] = value;
    };
    mockSpan = {
      traceId: "4efaaf4d1e8720b39541901950019ee5",
      spanId: "53995c3f42cd8ad8",
      attributes: [],
    } as unknown as InProgressSpan;
  });

  it("should add both W3C traceparent and X-Ray headers when both propagators match", () => {
    // Simulate what happens when both propagator types are matched
    const propagatorTypes = ["traceparent", "xray"];

    // Add headers for each type (this simulates addHeadersBasedOnTypes)
    for (const type of propagatorTypes) {
      if (type === "xray") {
        addXRayTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      } else if (type === "traceparent") {
        addW3CTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      }
    }

    // Verify both headers were added
    expect(headers).toHaveProperty("traceparent");
    expect(headers).toHaveProperty("X-Amzn-Trace-Id");

    // Verify header formats
    expect(headers["traceparent"]).toBe("00-4efaaf4d1e8720b39541901950019ee5-53995c3f42cd8ad8-01");
    expect(headers["X-Amzn-Trace-Id"]).toBe(
      "Root=1-4efaaf4d-1e8720b39541901950019ee5;Parent=53995c3f42cd8ad8;Sampled=1"
    );
  });

  it("should only add W3C header when only traceparent propagator matches", () => {
    const propagatorTypes = ["traceparent"];

    for (const type of propagatorTypes) {
      if (type === "xray") {
        addXRayTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      } else if (type === "traceparent") {
        addW3CTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      }
    }

    expect(headers).toHaveProperty("traceparent");
    expect(headers).not.toHaveProperty("X-Amzn-Trace-Id");
  });

  it("should only add X-Ray header when only xray propagator matches", () => {
    const propagatorTypes = ["xray"];

    for (const type of propagatorTypes) {
      if (type === "xray") {
        addXRayTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      } else if (type === "traceparent") {
        addW3CTraceContextHttpHeaders(mockAppend, {}, mockSpan);
      }
    }

    expect(headers).not.toHaveProperty("traceparent");
    expect(headers).toHaveProperty("X-Amzn-Trace-Id");
  });

  it("should handle Headers object correctly", () => {
    const headersObj = new Headers();
    const propagatorTypes = ["traceparent", "xray"];

    for (const type of propagatorTypes) {
      if (type === "xray") {
        addXRayTraceContextHttpHeaders(headersObj.append.bind(headersObj), headersObj, mockSpan);
      } else if (type === "traceparent") {
        addW3CTraceContextHttpHeaders(headersObj.append.bind(headersObj), headersObj, mockSpan);
      }
    }

    expect(headersObj.get("traceparent")).toBe("00-4efaaf4d1e8720b39541901950019ee5-53995c3f42cd8ad8-01");
    expect(headersObj.get("X-Amzn-Trace-Id")).toBe(
      "Root=1-4efaaf4d-1e8720b39541901950019ee5;Parent=53995c3f42cd8ad8;Sampled=1"
    );
  });
});
