import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "../types/otlp";

vi.mock("./fetch", () => ({
  send: vi.fn(() => Promise.resolve()),
}));

// The SDK's timer wrapper captures the window timers at import time, before vitest installs fake timers.
// Resolve the globals lazily so vi.useFakeTimers() drives the rate limiter's reset intervals.
vi.mock("../utils/timers", () => ({
  setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) => globalThis.setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof globalThis.clearTimeout>) => globalThis.clearTimeout(...args),
  setInterval: (...args: Parameters<typeof globalThis.setInterval>) => globalThis.setInterval(...args),
  clearInterval: (...args: Parameters<typeof globalThis.clearInterval>) => globalThis.clearInterval(...args),
}));

type Module = typeof import("./index");

function log(seq: number): LogRecord {
  return {
    timeUnixNano: "1",
    severityNumber: 9,
    severityText: "INFO",
    body: { stringValue: "[]" },
    attributes: [{ key: "dash0.session_recording.seq", value: { intValue: String(seq) } }],
  };
}

describe("sendSessionRecordingChunk", () => {
  let mod: Module;
  let vars: typeof import("../vars").vars;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mod = await import("./index");
    vars = (await import("../vars")).vars;
    send = (await import("./fetch")).send as any;
    send.mockClear();
    vars.isSessionSampled = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends each chunk as its own compressed /v1/logs request, bypassing the log batcher", () => {
    mod.sendSessionRecordingChunk(log(0));
    mod.sendSessionRecordingChunk(log(1));

    expect(send).toHaveBeenCalledTimes(2);
    for (const [path, body, opts] of send.mock.calls) {
      expect(path).toBe("/v1/logs");
      expect(body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(1);
      expect(opts).toEqual({ compress: true });
    }
  });

  it("sends uncompressed when asked to, so the unload flush reaches fetch synchronously", () => {
    mod.sendSessionRecordingChunk(log(0), { compress: false });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![2]).toEqual({ compress: false });
  });

  it("does not send when the session is not sampled", () => {
    vars.isSessionSampled = false;
    mod.sendSessionRecordingChunk(log(0));
    expect(send).not.toHaveBeenCalled();
  });

  it("drops chunks beyond its own burst budget without touching the shared log budget", () => {
    for (let i = 0; i < 70; i++) {
      mod.sendSessionRecordingChunk(log(i));
    }
    expect(send).toHaveBeenCalledTimes(64);

    // Regular logs are batched, not sent immediately; the point is that they are still accepted.
    mod.sendLog(log(100));
    vi.advanceTimersByTime(10_000);
    const logPaths = send.mock.calls.slice(64).map((c) => c[0]);
    expect(logPaths).toContain("/v1/logs");

    // The ten-second window has reset, so recording chunks flow again.
    send.mockClear();
    mod.sendSessionRecordingChunk(log(71));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
