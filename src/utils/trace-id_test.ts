import { expect, describe, it } from "vitest";
import { generateTraceId } from "./trace-id";

describe("generateTraceId", () => {
  it("returns a trace ID of the expected length", () => {
    const traceId = generateTraceId(null);

    expect(traceId).toHaveLength(32);
  });

  it("returns a trace ID with correct prefix when a session id is set", () => {
    const traceId = generateTraceId("abcdef1234567890");

    expect(traceId.substring(0, 6)).toEqual("d04200");
  });

  it("returns a trace ID with correct prefix when NOT session is set", () => {
    const traceId = generateTraceId(null);

    expect(traceId.substring(0, 6)).toEqual("d04201");
  });

  it("returns a unique trace ID on each call", () => {
    const sessiondId = "abcdef1234567890";
    const traceId1 = generateTraceId("abcdef1234567890");
    const traceId2 = generateTraceId("abcdef1234567890");

    expect(traceId1).not.toBe(traceId2);
    expect(traceId1.substring(6, 22)).toBe(sessiondId);
    expect(traceId2.substring(6, 22)).toBe(sessiondId);
  });

  it("returns a unique trace ID when session id is not set", () => {
    const traceId1 = generateTraceId(null);
    const sessionId1 = traceId1.substring(6, 22);
    const traceId2 = generateTraceId(null);
    const sessionId2 = traceId2.substring(6, 22);

    expect(traceId1).not.toBe(traceId2);
    expect(sessionId1).not.toBe(sessionId2);
  });
});
