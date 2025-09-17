import { describe, it, expect } from "vitest";
import { addXRayTraceContextHttpHeaders } from "./trace-context";
import { InProgressSpan } from "./span";

describe("X-Ray trace context", () => {
  it("should generate X-Ray header with correct format", () => {
    const span = {
      traceId: "4efaaf4d1e8720b39541901950019ee5",
      spanId: "53995c3f42cd8ad8",
    } as InProgressSpan;

    const headers: Record<string, string> = {};
    const mockAppend = (name: string, value: string) => {
      headers[name] = value;
    };

    addXRayTraceContextHttpHeaders(mockAppend, {}, span);

    expect(headers["X-Amzn-Trace-Id"]).toBe(
      "Root=1-4efaaf4d-1e8720b39541901950019ee5;Parent=53995c3f42cd8ad8;Sampled=1"
    );
  });

  it("should convert W3C trace ID to X-Ray format correctly", () => {
    const span = {
      traceId: "5759e988bd862e3fe1be46a994272793",
      spanId: "53995c3f42cd8ad8",
    } as InProgressSpan;

    const headers: Record<string, string> = {};
    const mockAppend = (name: string, value: string) => {
      headers[name] = value;
    };

    addXRayTraceContextHttpHeaders(mockAppend, {}, span);

    expect(headers["X-Amzn-Trace-Id"]).toBe(
      "Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1"
    );
  });

  it("should handle different span IDs", () => {
    const span = {
      traceId: "4efaaf4d1e8720b39541901950019ee5",
      spanId: "1234567890abcdef",
    } as InProgressSpan;

    const headers: Record<string, string> = {};
    const mockAppend = (name: string, value: string) => {
      headers[name] = value;
    };

    addXRayTraceContextHttpHeaders(mockAppend, {}, span);

    expect(headers["X-Amzn-Trace-Id"]).toBe(
      "Root=1-4efaaf4d-1e8720b39541901950019ee5;Parent=1234567890abcdef;Sampled=1"
    );
  });
});
