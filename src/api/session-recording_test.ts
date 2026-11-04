import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../instrumentations/session-recording", () => ({
  restartSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

import { restartSessionRecording, stopSessionRecording as stopImpl } from "../instrumentations/session-recording";
import { startSessionRecording, stopSessionRecording } from "./session-recording";

describe("session recording api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates start to a restart, which only records when init enabled recording", () => {
    startSessionRecording();
    expect(restartSessionRecording).toHaveBeenCalledTimes(1);
  });

  it("delegates stop", () => {
    stopSessionRecording();
    expect(stopImpl).toHaveBeenCalledTimes(1);
  });
});
