import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogRecord } from "../../types/otlp";
import { win } from "../../utils";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

describe("unhandled promise rejection instrumentation", () => {
  let module: typeof import("./unhandled-promise-rejection");
  let sendLog: ReturnType<typeof vi.fn>;
  const appListeners: Array<(event: Event) => void> = [];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    module = await import("./unhandled-promise-rejection");
    sendLog = (await import("../../transport")).sendLog as unknown as ReturnType<typeof vi.fn>;
    sendLog.mockClear();
    module.startUnhandledRejectionInstrumentation();
  });

  afterEach(() => {
    win!.removeEventListener("unhandledrejection", module.onUnhandledRejection);
    for (const listener of appListeners.splice(0)) {
      win!.removeEventListener("unhandledrejection", listener);
    }
    vi.useRealTimers();
  });

  function addAppListener(listener: (event: Event) => void) {
    appListeners.push(listener);
    win!.addEventListener("unhandledrejection", listener);
  }

  function rejectUnhandled(reason: unknown) {
    const event = new Event("unhandledrejection", { cancelable: true });
    Object.defineProperty(event, "reason", { value: reason });
    win!.dispatchEvent(event);
    vi.advanceTimersByTime(1000);
  }

  function reportedMessages(): Array<string | undefined> {
    return sendLog.mock.calls.map((call) => (call[0] as LogRecord).body?.stringValue);
  }

  it("reports a rejection no listener handled", () => {
    rejectUnhandled(new Error("lava potato"));

    expect(reportedMessages()).toEqual(["Unhandled promise rejection: lava potato"]);
  });

  it("does not report a rejection that a listener registered after the SDK prevented", () => {
    addAppListener((event) => event.preventDefault());

    rejectUnhandled(new Error("lava potato"));

    expect(sendLog).not.toHaveBeenCalled();
  });
});
