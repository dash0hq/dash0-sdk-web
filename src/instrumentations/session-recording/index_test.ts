import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecorder, SessionRecorderOptions } from "../../types/session-recording";
import { win } from "../../utils";

vi.mock("../../transport", () => ({
  sendSessionRecordingChunk: vi.fn(),
  sendLog: vi.fn(),
  sendSpan: vi.fn(),
}));

vi.mock("../../api/session", () => ({
  sessionId: "aabbccdd11223344",
}));

type Module = typeof import("./index");

describe("session recording lifecycle", () => {
  let mod: Module;
  let vars: typeof import("../../vars").vars;
  let sendSessionRecordingChunk: ReturnType<typeof vi.fn>;
  let stopFn: ReturnType<typeof vi.fn>;
  let recorder: ReturnType<typeof vi.fn> & SessionRecorder;
  let capturedOptions: SessionRecorderOptions | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mod = await import("./index");
    vars = (await import("../../vars")).vars;
    sendSessionRecordingChunk = (await import("../../transport")).sendSessionRecordingChunk as any;
    sendSessionRecordingChunk.mockClear();

    vars.isSessionSampled = true;
    vars.ignoreUrls = [];
    vars.endpoints = [{ url: "https://ingress.example.com", authToken: "x" }];
    vars.sessionRecording = { ...vars.sessionRecording, samplingRate: 100, recorder: undefined };

    stopFn = vi.fn();
    capturedOptions = undefined;
    recorder = vi.fn((opts: SessionRecorderOptions) => {
      capturedOptions = opts;
      return stopFn;
    }) as any;
  });

  afterEach(() => {
    mod.stopSessionRecording();
    vi.useRealTimers();
  });

  it("does not start before init arms recording", () => {
    mod.registerSessionRecorder(recorder);
    expect(recorder).not.toHaveBeenCalled();
    expect(mod.isSessionRecording()).toBe(false);
  });

  it("starts when armed after the recorder was registered", () => {
    mod.registerSessionRecorder(recorder);
    mod.armSessionRecording();
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(mod.isSessionRecording()).toBe(true);
  });

  it("starts when the recorder is registered after arming", () => {
    mod.armSessionRecording();
    expect(recorder).not.toHaveBeenCalled();
    mod.registerSessionRecorder(recorder);
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it("picks up window.dash0Recorder when arming, so the recorder script may run before the initializer", () => {
    (win as any).dash0Recorder = recorder;
    try {
      mod.armSessionRecording();
      expect(recorder).toHaveBeenCalledTimes(1);
      expect(mod.isSessionRecording()).toBe(true);
    } finally {
      delete (win as any).dash0Recorder;
    }
  });

  it("prefers an explicitly registered recorder over window.dash0Recorder", () => {
    const globalRecorder = vi.fn(() => vi.fn());
    (win as any).dash0Recorder = globalRecorder;
    try {
      mod.registerSessionRecorder(recorder);
      mod.armSessionRecording();
      expect(recorder).toHaveBeenCalledTimes(1);
      expect(globalRecorder).not.toHaveBeenCalled();
    } finally {
      delete (win as any).dash0Recorder;
    }
  });

  it("ignores a window.dash0Recorder that is not a function", () => {
    (win as any).dash0Recorder = "nope";
    try {
      mod.armSessionRecording();
      expect(mod.isSessionRecording()).toBe(false);
    } finally {
      delete (win as any).dash0Recorder;
    }
  });

  it("uses the recorder from vars.sessionRecording.recorder", () => {
    vars.sessionRecording.recorder = recorder;
    mod.armSessionRecording();
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it("does not start twice", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    mod.registerSessionRecorder(recorder);
    mod.armSessionRecording();
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it("forwards privacy settings to the recorder with masking on by default", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);

    expect(capturedOptions).toMatchObject({
      maskAllInputs: true,
      maskTextClass: "dash0-mask",
      blockClass: "dash0-block",
      recordCanvas: false,
      collectFonts: false,
      checkoutEveryNms: 300000,
    });
    expect(typeof capturedOptions!.emit).toBe("function");
  });

  it("does not start when the session is not sampled", () => {
    vars.isSessionSampled = false;
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    expect(recorder).not.toHaveBeenCalled();
  });

  it("does not start when the recording sampling rate excludes the session", () => {
    vars.sessionRecording.samplingRate = 0;
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    expect(recorder).not.toHaveBeenCalled();
  });

  it("does not start when the page url is ignored", () => {
    vars.ignoreUrls = [/localhost/];
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    expect(recorder).not.toHaveBeenCalled();
  });

  it("survives a recorder that throws", () => {
    const throwing = vi.fn(() => {
      throw new Error("boom");
    }) as any;
    mod.armSessionRecording();
    mod.registerSessionRecorder(throwing);
    expect(mod.isSessionRecording()).toBe(false);
  });

  it("discards events emitted by a recorder that then refuses to start", () => {
    // rrweb emits Meta + FullSnapshot synchronously and returns undefined when it cannot record.
    const refusing = vi.fn((opts: SessionRecorderOptions) => {
      opts.emit({ type: 4, timestamp: 1000, data: {} });
      opts.emit({ type: 2, timestamp: 1001, data: {} });
      return undefined;
    }) as any;
    mod.armSessionRecording();
    mod.registerSessionRecorder(refusing);

    expect(mod.isSessionRecording()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(sendSessionRecordingChunk).not.toHaveBeenCalled();

    // stop must be a harmless no-op afterwards
    expect(() => mod.stopSessionRecording()).not.toThrow();
    expect(sendSessionRecordingChunk).not.toHaveBeenCalled();
  });

  it("swallows a stop function that throws and still resets its state", () => {
    stopFn.mockImplementation(() => {
      throw new Error("stop failed");
    });
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });

    expect(() => mod.stopSessionRecording()).not.toThrow();
    expect(mod.isSessionRecording()).toBe(false);
    // buffered events are still flushed
    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
  });

  it("ignores events the recorder emits after stop", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    mod.stopSessionRecording();
    sendSessionRecordingChunk.mockClear();

    // rrweb's trailing throttle timers can still call emit after its stop function ran.
    capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });
    vi.advanceTimersByTime(10_000);
    expect(sendSessionRecordingChunk).not.toHaveBeenCalled();
  });

  it("compresses periodic chunks but sends the last-chance flush uncompressed", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);

    capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });
    vi.advanceTimersByTime(5000);
    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
    expect(sendSessionRecordingChunk.mock.calls[0]![1]).toEqual({ compress: true });

    capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });
    globalThis.dispatchEvent(new Event("pagehide"));
    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(2);
    expect(sendSessionRecordingChunk.mock.calls[1]![1]).toEqual({ compress: false });

    // back to normal once the page keeps running
    capturedOptions!.emit({ type: 3, timestamp: 3, data: {} });
    vi.advanceTimersByTime(5000);
    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(3);
    expect(sendSessionRecordingChunk.mock.calls[2]![1]).toEqual({ compress: true });
  });

  it("transmits chunks that share one trace id embedding the session id", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);

    capturedOptions!.emit({ type: 4, timestamp: 1000, data: {} });
    capturedOptions!.emit({ type: 2, timestamp: 1001, data: {} });
    vi.advanceTimersByTime(5000);
    capturedOptions!.emit({ type: 3, timestamp: 7000, data: {} });
    vi.advanceTimersByTime(5000);

    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(2);
    const [first, second] = sendSessionRecordingChunk.mock.calls.map((c) => c[0]);

    expect(first.traceId).toMatch(/^d04200aabbccdd11223344[0-9a-f]{10}$/);
    expect(second.traceId).toBe(first.traceId);
    expect(second.spanId).toBe(first.spanId);
    expect(first.attributes).toEqual(
      expect.arrayContaining([
        { key: "event.name", value: { stringValue: "browser.session_recording" } },
        { key: "dash0.session_recording.seq", value: { intValue: "0" } },
        { key: "dash0.session_recording.has_snapshot", value: { boolValue: true } },
      ])
    );
    expect(second.attributes).toEqual(
      expect.arrayContaining([
        { key: "dash0.session_recording.seq", value: { intValue: "1" } },
        { key: "dash0.session_recording.has_snapshot", value: { boolValue: false } },
      ])
    );
  });

  it("stops the recorder and flushes buffered events on stop", () => {
    mod.armSessionRecording();
    mod.registerSessionRecorder(recorder);
    capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });
    expect(sendSessionRecordingChunk).not.toHaveBeenCalled();

    mod.stopSessionRecording();

    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
    expect(mod.isSessionRecording()).toBe(false);
  });
});
