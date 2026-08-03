import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import { INTERACTION_DIRECTION, INTERACTION_TYPE } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import {
  handleScroll,
  flushScrollBurstForTests,
  startScrollInstrumentation,
  stopScrollInstrumentationForTests,
} from "./scroll";

// Vitest runs these tests in jsdom, so the SSR-safe doc/win are always defined.
const dom = doc!;
const globalWindow = win!;

function scrollEventFor(el: Element): Event {
  const event = new Event("scroll", { bubbles: false });
  Object.defineProperty(event, "target", { value: el });
  return event;
}

function lastLog(): LogRecord {
  const calls = (sendLog as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0] as LogRecord;
}

function attr(log: LogRecord, key: string) {
  return (log.attributes as { key: string; value: Record<string, unknown> }[]).find((kv) => kv.key === key)?.value;
}

/** jsdom elements have scrollTop/scrollLeft as plain settable properties. */
function scrollable(): HTMLElement {
  dom.body.innerHTML = `<div id="pane" class="pane" style="overflow:auto;height:100px"></div>`;
  return dom.getElementById("pane")!;
}

describe("scroll instrumentation", () => {
  beforeEach(() => {
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopScrollInstrumentationForTests();
    // Restores any addEventListener spy even when an assertion failed before the
    // test reached its own mockRestore, so the spy cannot leak into the next case.
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("collapses a burst of scroll events into a single event with the net direction", () => {
    const pane = scrollable();

    pane.scrollTop = 0;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 40;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 120;
    handleScroll(scrollEventFor(pane));

    flushScrollBurstForTests();

    expect(sendLog).toHaveBeenCalledOnce();
    const log = lastLog();
    expect(log.body).toEqual({ stringValue: "Scroll down on /" });
    expect(attr(log, INTERACTION_DIRECTION)).toEqual({ stringValue: "down" });
    expect(attr(log, INTERACTION_TYPE)).toEqual({ stringValue: "scroll" });
  });

  it("reports upward scrolling", () => {
    const pane = scrollable();

    pane.scrollTop = 200;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 20;
    handleScroll(scrollEventFor(pane));

    flushScrollBurstForTests();

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: "Scroll up on /" });
    expect(attr(log, INTERACTION_DIRECTION)).toEqual({ stringValue: "up" });
  });

  it("drops micro-scrolls below the noise threshold", () => {
    const pane = scrollable();

    pane.scrollTop = 100;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 103; // 3px net movement
    handleScroll(scrollEventFor(pane));

    flushScrollBurstForTests();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("emits nothing while a burst is still in flight", () => {
    const pane = scrollable();

    pane.scrollTop = 0;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 500;
    handleScroll(scrollEventFor(pane));

    expect(sendLog).not.toHaveBeenCalled(); // settle timer still pending
    flushScrollBurstForTests();
    expect(sendLog).toHaveBeenCalledOnce();
  });

  describe("startScrollInstrumentation (real capture-phase listener + isTrusted gate)", () => {
    it("registers exactly one window-level capture-phase scroll listener", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startScrollInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
      // `passive: true` is load-bearing: scroll fires per frame on the input
      // delay path, and a non-passive listener lets the SDK block scrolling.
      expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true, passive: true });

      addSpy.mockRestore();
    });

    it("does not register a second listener if called twice (idempotent start)", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startScrollInstrumentation();
      startScrollInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
      addSpy.mockRestore();
    });

    it("clears an in-flight burst on teardown even when the listener was never attached", () => {
      const pane = scrollable();

      pane.scrollTop = 0;
      handleScroll(scrollEventFor(pane));
      pane.scrollTop = 300;
      handleScroll(scrollEventFor(pane));

      // Most tests here drive handleScroll directly and never call start*, so the
      // teardown has to reset module state above its listenerAttached guard --
      // otherwise this burst and its pending settle timer bleed into the next test.
      stopScrollInstrumentationForTests();

      flushScrollBurstForTests();
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("ignores untrusted (synthetic) scrolls -- jsdom's dispatchEvent always yields isTrusted: false", () => {
      const pane = scrollable();
      startScrollInstrumentation();

      pane.scrollTop = 0;
      // scroll does not bubble, but a capture-phase listener on window is on the
      // propagation path of every dispatch, so this really does reach the listener.
      const event = new Event("scroll", { bubbles: false });
      pane.dispatchEvent(event);
      pane.scrollTop = 400;
      pane.dispatchEvent(new Event("scroll", { bubbles: false }));

      expect(event.isTrusted).toBe(false);
      // Flushing is what makes this assertion mean "no burst was ever started"
      // rather than "the settle timer has not fired yet".
      flushScrollBurstForTests();
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("processes a scroll when isTrusted is stubbed true, proving the gate is the only thing blocking synthetic scrolls", () => {
      // jsdom defines `isTrusted` as a non-configurable accessor on its Event
      // prototype, so there is no way to construct a pre-trusted event -- see the
      // long-form explanation in click_test.ts. Capture the real listener
      // registered by startScrollInstrumentation and invoke it directly instead.
      const pane = scrollable();
      const addSpy = vi.spyOn(globalWindow, "addEventListener");
      startScrollInstrumentation();

      const listener = addSpy.mock.calls.find((call) => call[0] === "scroll")![1] as EventListener;
      // Two events, not one: the burst baseline is sampled from the first event,
      // so a single-event burst has a net delta of 0 and is dropped as a
      // micro-scroll. This shape asserts the gate, not the sampling behaviour.
      pane.scrollTop = 0;
      listener({ isTrusted: true, target: pane } as unknown as Event);
      pane.scrollTop = 120;
      listener({ isTrusted: true, target: pane } as unknown as Event);

      addSpy.mockRestore();
      flushScrollBurstForTests();
      expect(sendLog).toHaveBeenCalledOnce();
    });
  });

  describe("error handling", () => {
    it("swallows errors while tracking a burst and starts no burst at all", () => {
      const pane = scrollable();
      Object.defineProperty(pane, "scrollTop", {
        get() {
          throw new Error("boom");
        },
      });

      expect(() => handleScroll(scrollEventFor(pane))).not.toThrow();

      flushScrollBurstForTests();
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("swallows errors while finalizing a burst and still resets burst state", () => {
      const pane = scrollable();

      pane.scrollTop = 0;
      handleScroll(scrollEventFor(pane));
      pane.scrollTop = 200;
      handleScroll(scrollEventFor(pane));

      (sendLog as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      // finalizeBurst runs inside the settle timer in production, where an
      // uncaught throw is unrecoverable.
      expect(() => flushScrollBurstForTests()).not.toThrow();

      // The burst is cleared before the try block, so one poisoned burst must not
      // wedge every subsequent scroll.
      pane.scrollTop = 400;
      handleScroll(scrollEventFor(pane));
      pane.scrollTop = 600;
      handleScroll(scrollEventFor(pane));
      flushScrollBurstForTests();

      expect(sendLog).toHaveBeenCalledTimes(2);
      expect(lastLog().body).toEqual({ stringValue: "Scroll down on /" });
    });
  });
});
