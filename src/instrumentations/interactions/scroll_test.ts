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

  /**
   * Real dispatch order: the offset changes first, the scroll event follows. So
   * every `scrollTop` assignment below is immediately followed by the event it
   * caused, and the position a burst started from is never itself the subject of
   * an event -- it is either remembered from an earlier burst, or assumed to be 0
   * for an element nobody has seen scroll yet.
   */
  function settleBurstAt(pane: HTMLElement, top: number): void {
    pane.scrollTop = top;
    handleScroll(scrollEventFor(pane));
    flushScrollBurstForTests();
    vi.clearAllMocks();
  }

  it("collapses a burst of scroll events into a single event with the net direction", () => {
    const pane = scrollable();

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
    settleBurstAt(pane, 200);

    pane.scrollTop = 120;
    handleScroll(scrollEventFor(pane));
    pane.scrollTop = 20;
    handleScroll(scrollEventFor(pane));

    flushScrollBurstForTests();

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: "Scroll up on /" });
    expect(attr(log, INTERACTION_DIRECTION)).toEqual({ stringValue: "up" });
  });

  it("emits a single-event burst, measured from where the previous burst ended", () => {
    const pane = scrollable();
    settleBurstAt(pane, 200);

    // One event is all a programmatic jump (`scrollTo`, anchor navigation,
    // `scrollIntoView`, Home/End) produces. Sampling the baseline from this very
    // event would net a delta of 0 and drop the burst as a micro-scroll.
    pane.scrollTop = 100;
    handleScroll(scrollEventFor(pane));
    flushScrollBurstForTests();

    expect(sendLog).toHaveBeenCalledOnce();
    expect(attr(lastLog(), INTERACTION_DIRECTION)).toEqual({ stringValue: "up" });
  });

  it("assumes an unseen element started at 0, so its very first burst is not lost either", () => {
    const pane = scrollable();

    pane.scrollTop = 400;
    handleScroll(scrollEventFor(pane));
    flushScrollBurstForTests();

    expect(sendLog).toHaveBeenCalledOnce();
    expect(attr(lastLog(), INTERACTION_DIRECTION)).toEqual({ stringValue: "down" });
  });

  it("keeps the observed end position when the element is reset or detached before the burst settles", () => {
    const pane = scrollable();

    pane.scrollTop = 200;
    handleScroll(scrollEventFor(pane));

    // A modal closing, a dropdown dismissing or a route change resets the
    // container inside the settle window. Re-reading it here would see 0 and
    // finalize a phantom "up".
    pane.remove();
    pane.scrollTop = 0;
    flushScrollBurstForTests();

    expect(sendLog).toHaveBeenCalledOnce();
    expect(attr(lastLog(), INTERACTION_DIRECTION)).toEqual({ stringValue: "down" });
  });

  it("does not read the element at all while finalizing", () => {
    const pane = scrollable();

    pane.scrollTop = 200;
    handleScroll(scrollEventFor(pane));

    // Stronger than the reset case above: any DOM read at finalize time now
    // throws, so the burst can only be finalized from what the handler saw.
    Object.defineProperty(pane, "scrollTop", {
      get() {
        throw new Error("scrollTop must not be read at finalize time");
      },
    });
    flushScrollBurstForTests();

    expect(sendLog).toHaveBeenCalledOnce();
    expect(attr(lastLog(), INTERACTION_DIRECTION)).toEqual({ stringValue: "down" });
  });

  it("drops micro-scrolls below the noise threshold", () => {
    const pane = scrollable();
    settleBurstAt(pane, 100);

    pane.scrollTop = 103; // 3px net movement
    handleScroll(scrollEventFor(pane));

    flushScrollBurstForTests();

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("emits nothing while a burst is still in flight", () => {
    const pane = scrollable();

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

      pane.scrollTop = 400;
      // scroll does not bubble, but a capture-phase listener on window is on the
      // propagation path of every dispatch, so this really does reach the listener.
      const event = new Event("scroll", { bubbles: false });
      pane.dispatchEvent(event);

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
