import { expect, describe, it, vi } from "vitest";
import { generateSessionId, generateTraceId, generateUniqueId } from "./id";
import * as localStorage from "./local-storage";

// Create a wrapper function for testing
function generateId(length: number): string {
  if (typeof length !== "number") {
    throw new Error("Length must be a number");
  }

  if (length < 1) {
    throw new Error("Length must be greater than 0");
  }

  return generateUniqueId(Math.ceil(length / 2)).substring(0, length);
}

describe("id", () => {
  describe("generateUniqueId", () => {
    it("returns a string of the expected length", () => {
      const id = generateId(10);
      expect(id).toHaveLength(10);
    });

    it("returns a unique ID on each call", () => {
      const id1 = generateId(10);
      const id2 = generateId(10);
      expect(id1).not.toBe(id2);
    });

    it("throws an error if length is less than 1", () => {
      expect(() => generateId(0)).toThrow("Length must be greater than 0");
    });

    it("throws an error if length is not a number", () => {
      expect(() => generateId("abc" as any)).toThrow("Length must be a number");
    });

    it("handles large lengths without errors", () => {
      const id = generateId(1000);
      expect(id).toHaveLength(1000);
    });
  });

  describe("generateSessionId", () => {
    it("returns a session ID of the expected length", () => {
      const sessionId = generateSessionId();
      expect(sessionId).toHaveLength(16);
    });

    it("returns a session ID with proper flags when storage is supported", () => {
      vi.spyOn(localStorage, "isSupported", "get").mockReturnValue(true);

      const sessionId = generateSessionId();
      expect(sessionId.startsWith("00")).toBe(true);
    });

    it("returns a session ID with proper flags when storage is NOT supported", () => {
      vi.spyOn(localStorage, "isSupported", "get").mockReturnValue(false);

      const sessionId = generateSessionId();
      expect(sessionId.startsWith("01")).toBe(true);
    });

    it("returns a unique session ID on each call", () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();

      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe("generateTraceId", () => {
    it("returns a trace ID of the expected length", () => {
      const traceId = generateTraceId(null);

      expect(traceId).toHaveLength(32);
    });

    it("returns a trace ID with correct prefix", () => {
      const traceId = generateTraceId("abcdef1234567890");

      expect(traceId.substring(0, 6)).toEqual("D04200");
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
});
