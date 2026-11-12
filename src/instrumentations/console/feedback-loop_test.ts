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
  let sentAt: number[];
  let start: number;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("console", { debug: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    sentBodies = [];
    sentAt = [];
    start = Date.now();
    // The page wrapped `fetch` before the SDK loaded. It logs every request, also the SDK's, and reads and logs every
    // response after its promise settled.
    vi.stubGlobal("fetch", async (_url: unknown, init: { body: string }) => {
      const records = JSON.parse(init.body).resourceLogs[0].scopeLogs[0].logRecords;
      sentBodies.push(records.map((r: { body: { stringValue: string } }) => r.body.stringValue));
      sentAt.push(Date.now() - start);
      console.warn("request started");
      const response = { ok: true, status: 200, statusText: "OK", text: () => Promise.resolve("") };
      setTimeout(() => console.warn("response read"), 100);
      return response;
    });

    const { vars } = await import("../../vars");
    vars.endpoints = [{ url: "https://ingress.example.com", authToken: "token" }];
    (await import("./index")).startConsoleInstrumentation();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("are sent less and less often on an idle page, and arrive with the next transmission", async () => {
    console.warn("first");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sentAt).toEqual([1_000, 11_000, 31_000]);
    expect(sentBodies).toEqual([["first"], ["request started", "response read"], ["request started", "response read"]]);

    console.warn("second");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sentAt[3]).toBe(61_000);
    expect(sentBodies[3]).toEqual(["request started", "response read", "second"]);
  });
});
