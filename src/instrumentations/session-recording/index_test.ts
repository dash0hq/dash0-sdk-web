import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecorder, SessionRecorderOptions } from "../../types/session-recording";

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
