import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogRecord } from "../../types/otlp";
import { EVENT_NAME, EVENT_NAMES, SESSION_RECORDING_ID } from "../../semantic-conventions";
import { doc } from "../../utils";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
  sendSpan: vi.fn(),
  sendSessionRecordingChunk: vi.fn(),
}));

vi.mock("../../api/session", () => ({
  sessionId: "aabbccdd11223344",
}));

vi.mock("../session-recording", () => ({
  onRecordingStateChange: vi.fn(),
}));

const RECORDING_ID = "00112233445566778899aabbccddeeff";

type Module = typeof import("./rage-click");

describe("rage click detection", () => {
  let mod: Module;
  let vars: typeof import("../../vars").vars;
  let sendLog: ReturnType<typeof vi.fn>;
  let handler: (event: Event) => void;
  /** Drives the recording lifecycle the detector subscribes to. */
  let setRecordingState: (recordingId: string | undefined) => void;
  /** Click listeners the detector registered on the document, newest last. */
  let registrations: Array<(event: Event) => void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mod = await import("./rage-click");
    vars = (await import("../../vars")).vars;
    sendLog = (await import("../../transport")).sendLog as any;
    sendLog.mockClear();
    const onRecordingStateChange = (await import("../session-recording")).onRecordingStateChange as any;
    onRecordingStateChange.mockClear();

    vars.frustrationSignals = { rageClick: { minClicks: 3, windowMillis: 1000, radiusPixels: 30 } };
    vars.sessionRecording = { ...vars.sessionRecording, maskTextClass: "dash0-mask", blockClass: "dash0-block" };

    doc!.body.innerHTML = "";

    // `isTrusted` is an unforgeable own accessor, so a dispatched jsdom event can never look like a
    // real user click. Capturing the listener lets the tests hand the detector the events a browser
    // would produce.
    registrations = [];
    const addEventListener = vi.spyOn(doc!, "addEventListener").mockImplementation((type: string, cb: any) => {
      if (type === "click") registrations.push(cb);
    });

    mod.startRageClickInstrumentation();
    setRecordingState = onRecordingStateChange.mock.calls[0]![0];

    // Every test but the ones about gating runs with a recording in progress.
    setRecordingState(RECORDING_ID);
    addEventListener.mockRestore();
    handler = registrations[0]!;
  });

  afterEach(() => {
    mod.resetRageClickInstrumentation();
    vi.useRealTimers();
  });

  function button(html: string): HTMLElement {
    doc!.body.innerHTML = html;
    return doc!.body.firstElementChild as HTMLElement;
  }

  function click(target: Element, opts?: { x?: number; y?: number; trusted?: boolean; button?: number }): void {
    handler({
      isTrusted: opts?.trusted ?? true,
      button: opts?.button ?? 0,
      clientX: opts?.x ?? 100,
      clientY: opts?.y ?? 100,
      target,
      composedPath: () => [target],
    } as unknown as Event);
  }

  /** Lets the open cluster time out, which is when a qualifying burst is reported. */
  function closeCluster(): void {
    vi.advanceTimersByTime(1001);
  }

  function lastLog(): LogRecord {
    return sendLog.mock.calls[sendLog.mock.calls.length - 1]![0];
  }

  function bodyValue(log: LogRecord, key: string): unknown {
    const entry = log.body?.kvlistValue?.values.find((kv) => kv.key === key);
    return entry?.value?.stringValue ?? entry?.value?.doubleValue;
  }

  it("reports three clicks on the same element as a rage click", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el);
    click(el);
    click(el);
    expect(sendLog).not.toHaveBeenCalled(); // still open, the burst may continue

    closeCluster();

    expect(sendLog).toHaveBeenCalledTimes(1);
    const log = lastLog();
    const eventName = log.attributes.find((kv) => kv.key === EVENT_NAME);
    expect(eventName?.value?.stringValue).toBe(EVENT_NAMES.RAGE_CLICK);
    expect(bodyValue(log, "click_count")).toBe(3);
    expect(bodyValue(log, "selector")).toBe("#checkout");
    expect(bodyValue(log, "text")).toBe("Place order");
  });

  it("carries the id of the recording the burst happened in", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el);
    click(el);
    click(el);
    closeCluster();

    const recording = lastLog().attributes.find((kv) => kv.key === SESSION_RECORDING_ID);
    expect(recording?.value?.stringValue).toBe(RECORDING_ID);
  });

  describe("gating on session recording", () => {
    it("does not observe clicks before a recording starts", async () => {
      vi.resetModules();
      const freshMod = await import("./rage-click");
      const onRecordingStateChange = (await import("../session-recording")).onRecordingStateChange as any;
      onRecordingStateChange.mockClear();

      const seen: Array<(event: Event) => void> = [];
      const addEventListener = vi.spyOn(doc!, "addEventListener").mockImplementation((type: string, cb: any) => {
        if (type === "click") seen.push(cb);
      });
      freshMod.startRageClickInstrumentation();
      addEventListener.mockRestore();

      expect(seen).toHaveLength(0);
      freshMod.resetRageClickInstrumentation();
    });

    it("stops observing once the recording ends", () => {
      const el = button(`<button id="checkout">Place order</button>`);
      const removeEventListener = vi.spyOn(doc!, "removeEventListener");

      setRecordingState(undefined);
      sendLog.mockClear();

      expect(removeEventListener).toHaveBeenCalledWith("click", handler, true);
      removeEventListener.mockRestore();

      // Ignored even when the listener is invoked anyway, as it can be while the recording is
      // being torn down.
      click(el);
      click(el);
      click(el);
      closeCluster();

      expect(sendLog).not.toHaveBeenCalled();
    });

    it("reports an open burst when the recording ends mid-burst", () => {
      const el = button(`<button id="checkout">Place order</button>`);

      click(el);
      click(el);
      click(el);

      // A tab being hidden tears the recording down. The clicks happened on record, so they are
      // still reported, and still carry the recording they belong to.
      setRecordingState(undefined);

      expect(sendLog).toHaveBeenCalledTimes(1);
      expect(bodyValue(lastLog(), "click_count")).toBe(3);
      const recording = lastLog().attributes.find((kv) => kv.key === SESSION_RECORDING_ID);
      expect(recording?.value?.stringValue).toBe(RECORDING_ID);
    });

    it("observes again when a recording resumes", () => {
      const addEventListener = vi.spyOn(doc!, "addEventListener").mockImplementation((type: string, cb: any) => {
        if (type === "click") registrations.push(cb);
      });
      setRecordingState(undefined);
      setRecordingState("ffeeddccbbaa99887766554433221100");
      addEventListener.mockRestore();

      const el = button(`<button id="checkout">Place order</button>`);
      const resumed = registrations[registrations.length - 1]!;
      handler = resumed;

      click(el);
      click(el);
      click(el);
      closeCluster();

      expect(sendLog).toHaveBeenCalledTimes(1);
      const recording = lastLog().attributes.find((kv) => kv.key === SESSION_RECORDING_ID);
      expect(recording?.value?.stringValue).toBe("ffeeddccbbaa99887766554433221100");
    });
  });

  it("counts the whole burst, not just the first qualifying clicks", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    for (let i = 0; i < 6; i++) {
      click(el);
      vi.advanceTimersByTime(100);
    }
    closeCluster();

    expect(sendLog).toHaveBeenCalledTimes(1);
    expect(bodyValue(lastLog(), "click_count")).toBe(6);
  });

  it("ignores a burst below the threshold", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el);
    click(el);
    closeCluster();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("does not join clicks separated by more than the window", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el);
    vi.advanceTimersByTime(1500);
    click(el);
    vi.advanceTimersByTime(1500);
    click(el);
    closeCluster();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("keeps clicks on unrelated, distant elements in separate clusters", () => {
    doc!.body.innerHTML = `<button id="a">A</button><button id="b">B</button>`;
    const a = doc!.getElementById("a")!;
    const b = doc!.getElementById("b")!;

    click(a, { x: 10, y: 10 });
    click(b, { x: 400, y: 400 });
    click(a, { x: 10, y: 10 });
    closeCluster();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("joins clicks that land near each other after a re-render replaced the element", () => {
    const first = button(`<button class="retry">Retry</button>`);
    click(first, { x: 50, y: 50 });

    const second = button(`<button class="retry">Retry</button>`);
    click(second, { x: 55, y: 52 });
    click(second, { x: 48, y: 60 });
    closeCluster();

    expect(sendLog).toHaveBeenCalledTimes(1);
    expect(bodyValue(lastLog(), "click_count")).toBe(3);
  });

  it("ignores synthetic clicks", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el, { trusted: false });
    click(el, { trusted: false });
    click(el, { trusted: false });
    closeCluster();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("ignores non-primary buttons", () => {
    const el = button(`<button id="checkout">Place order</button>`);

    click(el, { button: 2 });
    click(el, { button: 2 });
    click(el, { button: 2 });
    closeCluster();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("honours a configured threshold", () => {
    vars.frustrationSignals = { rageClick: { minClicks: 5 } };
    const el = button(`<button id="checkout">Place order</button>`);

    click(el);
    click(el);
    click(el);
    closeCluster();
    expect(sendLog).not.toHaveBeenCalled();

    for (let i = 0; i < 5; i++) click(el);
    closeCluster();
    expect(sendLog).toHaveBeenCalledTimes(1);
  });

  it("omits the text of a masked element", () => {
    const el = button(`<button id="checkout" class="dash0-mask">Pay 1234 5678</button>`);

    click(el);
    click(el);
    click(el);
    closeCluster();

    expect(sendLog).toHaveBeenCalledTimes(1);
    expect(bodyValue(lastLog(), "text")).toBeUndefined();
    expect(bodyValue(lastLog(), "selector")).toBe("#checkout");
  });

  it("never reports what a user typed into an input", () => {
    const el = button(`<input id="email" type="email" value="someone@example.com" placeholder="Your email" />`);

    click(el);
    click(el);
    click(el);
    closeCluster();

    expect(sendLog).toHaveBeenCalledTimes(1);
    expect(bodyValue(lastLog(), "text")).toBe("Your email");
  });

  it("builds a structural selector when no id or data attribute is present", () => {
    doc!.body.innerHTML = `<div class="cart"><span>x</span><span>Remove</span></div>`;
    const el = doc!.querySelectorAll("span")[1]!;

    click(el);
    click(el);
    click(el);
    closeCluster();

    expect(bodyValue(lastLog(), "selector")).toBe("div.cart>span:nth-of-type(2)");
  });
});
