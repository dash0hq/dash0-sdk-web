import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../instrumentations/session-recording", () => ({
  GLOBAL_RECORDER_KEY: "dash0Recorder",
  registerSessionRecorder: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

import { registerSessionRecorder, stopSessionRecording as stopImpl } from "../instrumentations/session-recording";
import { startSessionRecording, stopSessionRecording } from "./session-recording";
import { win } from "../utils";

const globalObject = win as any;

describe("startSessionRecording api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalObject.dash0Recorder;
  });

  it("registers an explicitly passed recorder", () => {
    const recorder = vi.fn();
    startSessionRecording(recorder as any);
    expect(registerSessionRecorder).toHaveBeenCalledWith(recorder);
  });

  it("falls back to window.dash0Recorder", () => {
    const recorder = vi.fn();
    globalObject.dash0Recorder = recorder;
    startSessionRecording();
    expect(registerSessionRecorder).toHaveBeenCalledWith(recorder);
  });

  it("ignores calls without a usable recorder instead of throwing", () => {
    expect(() => startSessionRecording()).not.toThrow();
    expect(() => startSessionRecording("nope" as any)).not.toThrow();
    expect(registerSessionRecorder).not.toHaveBeenCalled();
  });

  it("delegates stop", () => {
    stopSessionRecording();
    expect(stopImpl).toHaveBeenCalledTimes(1);
  });
});
