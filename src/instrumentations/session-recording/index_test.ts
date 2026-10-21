import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecorder, SessionRecorderOptions } from "../../types/session-recording";
import { doc, win } from "../../utils";

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
  let storage: typeof import("../../utils/local-storage");
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
    storage = await import("../../utils/local-storage");
    storage.removeItem(mod.SHOWN_RECORDING_STORAGE_KEY);

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

  describe("visibility", () => {
    /**
     * jsdom's `visibilityState` is a getter on the Document prototype, so it can only be changed by
     * redefining it. Restored by the `afterEach` below.
     */
    function setVisibilityState(state: DocumentVisibilityState): void {
      Object.defineProperty(doc!, "visibilityState", { value: state, configurable: true });
    }

    function setVisibility(state: DocumentVisibilityState): void {
      setVisibilityState(state);
      doc!.dispatchEvent(new Event("visibilitychange"));
    }

    afterEach(() => {
      setVisibilityState("visible");
    });

    it("defers the start of a tab that is hidden when recording is armed", () => {
      setVisibilityState("hidden");

      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);

      expect(recorder).not.toHaveBeenCalled();
      expect(mod.isSessionRecording()).toBe(false);

      setVisibility("visible");

      expect(recorder).toHaveBeenCalledTimes(1);
      expect(mod.isSessionRecording()).toBe(true);
    });

    function recordingIdOf(call: unknown[]): string {
      return (call[0] as any).attributes.find((a: any) => a.key === "dash0.session_recording.id").value.stringValue;
    }

    function attributeOf(call: unknown[], key: string): any {
      return (call[0] as any).attributes.find((a: any) => a.key === key).value;
    }

    function bodyOf(call: unknown[]): Array<{ type: number; timestamp: number }> {
      return JSON.parse((call[0] as any).body.stringValue);
    }

    function withSnapshotOnDemand(): ReturnType<typeof vi.fn> {
      const takeFullSnapshot = vi.fn(() => {
        capturedOptions!.emit({ type: 4, timestamp: 900, data: {} });
        capturedOptions!.emit({ type: 2, timestamp: 901, data: {} });
      });
      (recorder as any).takeFullSnapshot = takeFullSnapshot;
      return takeFullSnapshot;
    }

    it("keeps the recorder running while hidden and transmits nothing it records then", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });

      setVisibility("hidden");

      expect(stopFn).not.toHaveBeenCalled();
      expect(mod.isSessionRecording()).toBe(false);
      expect(mod.activeRecordingId()).toBeUndefined();
      // Buffered events are flushed uncompressed: a hidden document may be discarded before an
      // asynchronous gzip completes.
      expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
      expect(sendSessionRecordingChunk.mock.calls[0]![1]).toEqual({ compress: false });

      capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });
      vi.advanceTimersByTime(10_000);
      globalThis.dispatchEvent(new Event("pagehide"));

      expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
    });

    it("continues the same run without a new snapshot when no other run was shown while hidden", () => {
      const takeFullSnapshot = withSnapshotOnDemand();
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });
      setVisibility("hidden");
      capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });

      setVisibility("visible");

      expect(recorder).toHaveBeenCalledTimes(1);
      expect(takeFullSnapshot).not.toHaveBeenCalled();
      expect(mod.isSessionRecording()).toBe(true);

      capturedOptions!.emit({ type: 3, timestamp: 3, data: {} });
      vi.advanceTimersByTime(5000);

      expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(2);
      const [beforeHide, afterShow] = sendSessionRecordingChunk.mock.calls;
      expect(recordingIdOf(afterShow!)).toBe(recordingIdOf(beforeHide!));
      expect(mod.activeRecordingId()).toBe(recordingIdOf(beforeHide!));
      expect(attributeOf(afterShow!, "dash0.session_recording.seq")).toEqual({ intValue: "1" });
      // What changed while hidden is transmitted once the document is on screen again, ahead of what follows.
      expect(bodyOf(afterShow!).map((e) => e.timestamp)).toEqual([2, 3]);
      expect(afterShow![1]).toEqual({ compress: true });
    });

    it("starts a new run with a snapshot from the running recorder when another run was shown while hidden", () => {
      const takeFullSnapshot = withSnapshotOnDemand();
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      capturedOptions!.emit({ type: 3, timestamp: 1, data: {} });
      setVisibility("hidden");
      capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });
      // What another tab writes when its run is shown.
      storage.setItem(mod.SHOWN_RECORDING_STORAGE_KEY, "another-run");

      setVisibility("visible");

      expect(recorder).toHaveBeenCalledTimes(1);
      expect(stopFn).not.toHaveBeenCalled();
      expect(takeFullSnapshot).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000);

      expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(2);
      const [beforeHide, afterShow] = sendSessionRecordingChunk.mock.calls;
      const newRunId = recordingIdOf(afterShow!);
      expect(newRunId).not.toBe(recordingIdOf(beforeHide!));
      expect(attributeOf(afterShow!, "dash0.session_recording.seq")).toEqual({ intValue: "0" });
      expect(attributeOf(afterShow!, "dash0.session_recording.has_snapshot")).toEqual({ boolValue: true });
      // Held events belong to a document the replay no longer shows; the snapshot replaces them.
      expect(bodyOf(afterShow!).map((e) => e.type)).toEqual([4, 2]);
      expect(storage.getItem(mod.SHOWN_RECORDING_STORAGE_KEY)).toBe(newRunId);
      expect(mod.activeRecordingId()).toBe(newRunId);
    });

    it("treats a missing record of the shown run as another run having been shown", () => {
      const takeFullSnapshot = withSnapshotOnDemand();
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      storage.removeItem(mod.SHOWN_RECORDING_STORAGE_KEY);

      setVisibility("visible");

      expect(takeFullSnapshot).toHaveBeenCalledTimes(1);
    });

    it("restarts the recorder when it cannot take a snapshot on demand", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      storage.setItem(mod.SHOWN_RECORDING_STORAGE_KEY, "another-run");

      setVisibility("visible");

      expect(stopFn).toHaveBeenCalledTimes(1);
      expect(recorder).toHaveBeenCalledTimes(2);
      expect(mod.isSessionRecording()).toBe(true);
    });

    it("restarts the recorder when taking a snapshot on demand fails", () => {
      (recorder as any).takeFullSnapshot = vi.fn(() => {
        throw new Error("boom");
      });
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      storage.setItem(mod.SHOWN_RECORDING_STORAGE_KEY, "another-run");

      setVisibility("visible");

      expect(stopFn).toHaveBeenCalledTimes(1);
      expect(recorder).toHaveBeenCalledTimes(2);
      expect(mod.isSessionRecording()).toBe(true);
    });

    it("stops the recorder once too much changed while hidden, and restarts it when shown again", () => {
      withSnapshotOnDemand();
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      sendSessionRecordingChunk.mockClear();

      capturedOptions!.emit({ type: 3, timestamp: 2, data: "x".repeat(mod.HIDDEN_EVENTS_MAX_BYTES) });
      expect(stopFn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(stopFn).toHaveBeenCalledTimes(1);

      setVisibility("visible");

      expect(recorder).toHaveBeenCalledTimes(2);
      expect(mod.isSessionRecording()).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(sendSessionRecordingChunk).not.toHaveBeenCalled();
    });

    it("takes a snapshot when shown again before a recorder that overflowed while hidden was stopped", () => {
      const takeFullSnapshot = withSnapshotOnDemand();
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");

      capturedOptions!.emit({ type: 3, timestamp: 2, data: "x".repeat(mod.HIDDEN_EVENTS_MAX_BYTES) });
      setVisibility("visible");
      vi.advanceTimersByTime(0);

      expect(takeFullSnapshot).toHaveBeenCalledTimes(1);
      expect(stopFn).not.toHaveBeenCalled();
      expect(mod.isSessionRecording()).toBe(true);
    });

    it("drops what it held before a checkout taken while hidden", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      sendSessionRecordingChunk.mockClear();
      capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });
      capturedOptions!.emit({ type: 4, timestamp: 3, data: {} });
      capturedOptions!.emit({ type: 2, timestamp: 4, data: {} });

      setVisibility("visible");
      vi.advanceTimersByTime(5000);

      expect(sendSessionRecordingChunk).toHaveBeenCalledTimes(1);
      expect(bodyOf(sendSessionRecordingChunk.mock.calls[0]!).map((e) => e.timestamp)).toEqual([3, 4]);
    });

    it("stops the recorder and drops what it held when the consumer stops while hidden", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      sendSessionRecordingChunk.mockClear();
      capturedOptions!.emit({ type: 3, timestamp: 2, data: {} });

      mod.stopSessionRecording();

      expect(stopFn).toHaveBeenCalledTimes(1);
      expect(sendSessionRecordingChunk).not.toHaveBeenCalled();
    });

    it("does not resurrect a recording the consumer stopped", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      mod.stopSessionRecording();

      setVisibility("hidden");
      setVisibility("visible");

      expect(recorder).toHaveBeenCalledTimes(1);
      expect(mod.isSessionRecording()).toBe(false);
    });

    it("records again after an explicit restart that follows a consumer stop", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      mod.stopSessionRecording();

      mod.registerSessionRecorder(recorder);

      expect(recorder).toHaveBeenCalledTimes(2);
      expect(mod.isSessionRecording()).toBe(true);
    });
  });

  describe("recording state listeners", () => {
    function setVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(doc!, "visibilityState", { value: state, configurable: true });
      doc!.dispatchEvent(new Event("visibilitychange"));
    }

    afterEach(() => {
      Object.defineProperty(doc!, "visibilityState", { value: "visible", configurable: true });
    });

    it("reports the recording id on start and undefined on stop", () => {
      const listener = vi.fn();
      mod.onRecordingStateChange(listener);
      expect(listener).not.toHaveBeenCalled();

      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);

      expect(listener).toHaveBeenCalledTimes(1);
      const recordingId = listener.mock.calls[0]![0];
      expect(recordingId).toMatch(/^[0-9a-f]+$/);

      mod.stopSessionRecording();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[1]![0]).toBeUndefined();
    });

    it("calls a listener that subscribes while a recording is already running", () => {
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);

      const listener = vi.fn();
      mod.onRecordingStateChange(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]![0]).toBe(mod.activeRecordingId());
    });

    it("reports a pause while hidden and the same recording when the run continues", () => {
      const listener = vi.fn();
      mod.onRecordingStateChange(listener);
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      const recordingId = listener.mock.calls[0]![0];
      listener.mockClear();

      setVisibility("hidden");
      setVisibility("visible");

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0]![0]).toBeUndefined();
      expect(listener.mock.calls[1]![0]).toBe(recordingId);
    });

    it("reports a new recording when another run was shown while hidden", () => {
      const listener = vi.fn();
      mod.onRecordingStateChange(listener);
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      const recordingId = listener.mock.calls[0]![0];
      listener.mockClear();

      setVisibility("hidden");
      storage.setItem(mod.SHOWN_RECORDING_STORAGE_KEY, "another-run");
      setVisibility("visible");

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0]![0]).toBeUndefined();
      expect(listener.mock.calls[1]![0]).toEqual(expect.any(String));
      expect(listener.mock.calls[1]![0]).not.toBe(recordingId);
    });

    it("does not report a stop again when the consumer stops while hidden", () => {
      const listener = vi.fn();
      mod.onRecordingStateChange(listener);
      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);
      setVisibility("hidden");
      listener.mockClear();

      mod.stopSessionRecording();

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not report a stop when nothing was recording", () => {
      const listener = vi.fn();
      mod.onRecordingStateChange(listener);

      mod.stopSessionRecording();

      expect(listener).not.toHaveBeenCalled();
    });

    it("survives a listener that throws", () => {
      mod.onRecordingStateChange(() => {
        throw new Error("boom");
      });

      mod.armSessionRecording();
      mod.registerSessionRecorder(recorder);

      expect(mod.isSessionRecording()).toBe(true);
    });
  });
});
