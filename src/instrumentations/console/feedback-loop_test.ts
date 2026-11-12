import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SDK's timer wrapper captures the window timers at import time, before vitest installs fake timers.
vi.mock("../../utils/timers", () => ({
  setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) => globalThis.setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof globalThis.clearTimeout>) => globalThis.clearTimeout(...args),
  setInterval: (...args: Parameters<typeof globalThis.setInterval>) => globalThis.setInterval(...args),
  clearInterval: (...args: Parameters<typeof globalThis.clearInterval>) => globalThis.clearInterval(...args),
}));

describe("console messages logged by a page that wraps fetch", () => {
  let sentBodies: string[][];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("console", { debug: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    sentBodies = [];
    // The page wrapped `fetch` before the SDK loaded. It logs every request and every failure, also the SDK's.
    vi.stubGlobal("fetch", async (_url: unknown, init: { body: string }) => {
      const records = JSON.parse(init.body).resourceLogs[0].scopeLogs[0].logRecords;
      sentBodies.push(records.map((r: { body: { stringValue: string } }) => r.body.stringValue));
      console.warn("request started");
      try {
        return await Promise.reject(new TypeError("Failed to fetch"));
      } catch (e) {
        console.warn("request failed:", e);
        throw e;
      }
    });

    const { vars } = await import("../../vars");
    vars.endpoints = [{ url: "https://ingress.example.com", authToken: "token" }];
    (await import("./index")).startConsoleInstrumentation();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("do not keep the SDK sending on an idle page, and arrive with the next transmission", async () => {
    console.warn("first");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sentBodies).toEqual([["first"]]);

    console.warn("second");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sentBodies).toEqual([
      ["first"],
      ["request started", "request failed: TypeError: Failed to fetch", "second"],
    ]);
  });
});
