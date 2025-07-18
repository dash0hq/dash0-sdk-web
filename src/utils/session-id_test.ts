import { describe, expect, it, vi } from "vitest";
import { generateSessionId } from "./session-id";
import * as localStorage from "./local-storage";

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
