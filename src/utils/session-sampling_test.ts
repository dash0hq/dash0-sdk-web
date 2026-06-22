import { describe, expect, it } from "vitest";
import { isSessionSampledIn } from "./session-sampling";
import { generateSessionId } from "./session-id";

describe("isSessionSampledIn", () => {
  it("returns false when sampling rate is 0", () => {
    expect(isSessionSampledIn("00abcdef01234567", 0)).toBe(false);
  });

  it("returns true when sampling rate is 100", () => {
    expect(isSessionSampledIn("00abcdef01234567", 100)).toBe(true);
  });

  it("returns deterministic results for the same session ID and rate", () => {
    const sessionId = "00abcdef01234567";
    const rate = 50;
    const result1 = isSessionSampledIn(sessionId, rate);
    const result2 = isSessionSampledIn(sessionId, rate);
    expect(result1).toBe(result2);
  });

  it("produces different results for different session IDs", () => {
    const results = new Set<boolean>();
    // Generate enough IDs to get both true and false with high probability
    for (let i = 0; i < 100; i++) {
      results.add(isSessionSampledIn(generateSessionId(), 50));
    }
    expect(results.size).toBe(2);
  });

  it("produces roughly correct distribution over many session IDs", () => {
    const rate = 30;
    const total = 10000;
    let sampledIn = 0;

    for (let i = 0; i < total; i++) {
      if (isSessionSampledIn(generateSessionId(), rate)) {
        sampledIn++;
      }
    }

    const actualRate = sampledIn / total;
    // Allow 5% tolerance
    expect(actualRate).toBeGreaterThan(0.25);
    expect(actualRate).toBeLessThan(0.35);
  });

  it("handles edge case: rate just above 0", () => {
    // With rate=1, about 1% of sessions should be sampled in
    let sampledIn = 0;
    const total = 10000;
    for (let i = 0; i < total; i++) {
      if (isSessionSampledIn(generateSessionId(), 1)) {
        sampledIn++;
      }
    }
    const actualRate = sampledIn / total;
    expect(actualRate).toBeGreaterThan(0.0);
    expect(actualRate).toBeLessThan(0.05);
  });

  it("handles edge case: rate just below 100", () => {
    // With rate=99, about 99% of sessions should be sampled in
    let sampledIn = 0;
    const total = 10000;
    for (let i = 0; i < total; i++) {
      if (isSessionSampledIn(generateSessionId(), 99)) {
        sampledIn++;
      }
    }
    const actualRate = sampledIn / total;
    expect(actualRate).toBeGreaterThan(0.95);
    expect(actualRate).toBeLessThan(1.0);
  });

  it("returns false for negative sampling rates", () => {
    expect(isSessionSampledIn("00abcdef01234567", -10)).toBe(false);
  });

  it("returns true for sampling rates above 100", () => {
    expect(isSessionSampledIn("00abcdef01234567", 150)).toBe(true);
  });
});
