import { describe, expect } from "vitest";
import { generateSpanId } from "./span-id";

describe("generateSpanId", () => {
  it("returns a span ID of the expected length", () => {
    expect(generateSpanId("abcdef1234567890abcdef1234567890")).toHaveLength(16);
  });

  it("returns the same prefix for the same trace ID", () => {
    const traceId = "abcdef1234567890abcdef1234567890";
    const spanId1 = generateSpanId(traceId);
    const spanId2 = generateSpanId(traceId);

    expect(spanId1.substring(0, 8)).toBe(spanId2.substring(0, 8));
    expect(spanId1).not.equals(spanId2);
  });

  it("returns different prefix for span ID for different trace IDs", () => {
    const spanId1 = generateSpanId("abcdef1234567890abcdef1234567890");
    const spanId2 = generateSpanId("1234567890abcdef1234567890abcdef");

    expect(spanId1.substring(0, 8)).not.equals(spanId2.substring(0, 8));
    expect(spanId1).not.equals(spanId2);
  });

  it("return a span id with the correct prefix", () => {
    expect(generateSpanId("abcdef1234567890abcdef1234567890").substring(0, 8)).toEqual("07d06023");
    expect(generateSpanId("1234567890abcdef1234567890abcdef").substring(0, 8)).toEqual("75df3ddf");
    expect(generateSpanId("d0420000a7a996090df1cac9a99d3cb7").substring(0, 8)).toEqual("120e82be");
  });
});
