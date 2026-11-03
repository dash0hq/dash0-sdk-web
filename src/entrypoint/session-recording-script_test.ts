import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_RECORDER_KEY, RECORDER_READY_EVENT } from "../instrumentations/session-recording";
import { win } from "../utils";

describe("session recording script", () => {
  afterEach(() => {
    delete (win as any)[GLOBAL_RECORDER_KEY];
    delete (win as any).dash0;
  });

  it("exposes the recorder and announces it without starting a recording", async () => {
    const dash0 = vi.fn();
    (win as any).dash0 = dash0;
    const announced = vi.fn();
    win!.addEventListener(RECORDER_READY_EVENT, announced);

    try {
      await import("./session-recording-script");
    } finally {
      win!.removeEventListener(RECORDER_READY_EVENT, announced);
    }

    expect(typeof (win as any)[GLOBAL_RECORDER_KEY].recorder).toBe("function");
    expect(announced).toHaveBeenCalledTimes(1);
    expect(dash0).not.toHaveBeenCalled();
  });
});
