import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import {
  INTERACTION_ID,
  INTERACTION_KEY,
  INTERACTION_REPEAT_COUNT,
  INTERACTION_TYPE,
} from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import {
  flushKeyPressBurstForTests,
  handleKeydown,
  KEYPRESS_SETTLE_MILLIS,
  startKeyPressInstrumentation,
  stopKeyPressInstrumentationForTests,
} from "./keypress";
import { clearActiveInteractionForTests, getActiveInteraction } from "./active-interaction";

// Vitest runs these tests in jsdom, so the SSR-safe doc/win are always defined.
const dom = doc!;
const globalWindow = win!;

function keydownOn(el: Element, key: string, repeat = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, repeat, bubbles: true });
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

describe("key press instrumentation", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopKeyPressInstrumentationForTests();
    clearActiveInteractionForTests();
    // Restores any addEventListener spy even when an assertion failed before the
    // test reached its own mockRestore, so the spy cannot leak into the next case.
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("captures Enter with the target's derived name", () => {
    dom.body.innerHTML = `<input id="search" type="text" aria-label="Search parts" />`;

    handleKeydown(keydownOn(dom.getElementById("search")!, "Enter"));

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Press Enter in "Search parts" on /' });
    expect(attr(log, INTERACTION_KEY)).toEqual({ stringValue: "Enter" });
    expect(attr(log, INTERACTION_TYPE)).toEqual({ stringValue: "key_press" });
  });

  it("normalizes the space key to a readable name", () => {
    dom.body.innerHTML = `<button id="b">Play</button>`;

    handleKeydown(keydownOn(dom.getElementById("b")!, " "));
    flushKeyPressBurstForTests();

    const log = lastLog();
    expect(attr(log, INTERACTION_KEY)).toEqual({ stringValue: "Space" });
    expect(log.body).toEqual({ stringValue: 'Press Space in "Play" on /' });
  });

  it("NEVER captures printable characters (no keylogging)", () => {
    dom.body.innerHTML = `<input id="pw" type="password" aria-label="Password" />`;
    const input = dom.getElementById("pw")!;

    for (const key of ["a", "Z", "1", "!", "ü", "€"]) {
      handleKeydown(keydownOn(input, key));
    }

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat from a held-down key", () => {
    dom.body.innerHTML = `<div id="list" tabindex="0"></div>`;
    const list = dom.getElementById("list")!;

    handleKeydown(keydownOn(list, "ArrowDown", false));
    handleKeydown(keydownOn(list, "ArrowDown", true));
    handleKeydown(keydownOn(list, "ArrowDown", true));
    flushKeyPressBurstForTests();

    // One event, and no repeat count: auto-repeat is filtered before it can be
    // mistaken for the user pressing the key again.
    expect(sendLog).toHaveBeenCalledOnce();
    expect(attr(lastLog(), INTERACTION_REPEAT_COUNT)).toBeUndefined();
  });

  it("registers Enter as the active interaction for span attribution", () => {
    dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;

    handleKeydown(keydownOn(dom.getElementById("q")!, "Enter"));

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("Search parts");
  });

  it("registers Space as the active interaction for span attribution", () => {
    dom.body.innerHTML = `<button id="b" aria-label="Play"></button>`;

    handleKeydown(keydownOn(dom.getElementById("b")!, " "));

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("Play");
  });

  it("does NOT register navigation keys for span attribution (but still emits their events)", () => {
    dom.body.innerHTML = `<div id="list" tabindex="0" aria-label="Results"></div>`;
    const list = dom.getElementById("list")!;

    for (const key of ["ArrowDown", "Tab", "Escape", "PageDown", "Home", "Backspace"]) {
      handleKeydown(keydownOn(list, key));
      expect(getActiveInteraction()).toBeUndefined();
    }
    // Each key finalizes the previous key's burst, leaving only the last pending.
    flushKeyPressBurstForTests();

    expect(sendLog).toHaveBeenCalledTimes(6);
  });

  it("a navigation key does not steal attribution from a preceding activation", () => {
    dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;
    const input = dom.getElementById("q")!;

    handleKeydown(keydownOn(input, "Enter"));
    const registered = getActiveInteraction()!;

    handleKeydown(keydownOn(input, "ArrowDown"));

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.id).toBe(registered.id);
    expect(active!.name).toBe("Search parts");
  });

  it("swallows errors from a throwing scenario and does not propagate", () => {
    dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;
    const input = dom.getElementById("q")!;
    // Force an internal error in the name derivation, the deepest DOM surface
    // the handler touches (same lever as click_test.ts -- a shadowed
    // `getAttribute` is bypassed by design, see utils/dom).
    Object.defineProperty(input, "parentElement", {
      get() {
        throw new Error("boom");
      },
    });

    expect(() => handleKeydown(keydownOn(input, "Enter"))).not.toThrow();

    expect(sendLog).not.toHaveBeenCalled();
    // Name derivation runs before registerActiveInteraction, so a throw must not
    // leave an interaction id behind for HTTP spans to join to.
    expect(getActiveInteraction()).toBeUndefined();
  });

  describe("coalescing", () => {
    it("collapses repeated presses of the same key into one event carrying the repeat count", () => {
      // Prose typing produces a press per word boundary and per correction, which
      // is what would otherwise dominate the interaction budget.
      dom.body.innerHTML = `<textarea id="notes" placeholder="Notes"></textarea>`;
      const notes = dom.getElementById("notes")!;

      for (let i = 0; i < 7; i++) {
        handleKeydown(keydownOn(notes, "Backspace"));
      }
      expect(sendLog).not.toHaveBeenCalled(); // settle timer still pending
      flushKeyPressBurstForTests();

      expect(sendLog).toHaveBeenCalledOnce();
      const log = lastLog();
      expect(log.body).toEqual({ stringValue: 'Press Backspace 7 times in "Notes" on /' });
      expect(attr(log, INTERACTION_REPEAT_COUNT)).toEqual({ doubleValue: 7 });
    });

    it("omits the repeat count for a single press", () => {
      dom.body.innerHTML = `<div id="list" tabindex="0" aria-label="Results"></div>`;

      handleKeydown(keydownOn(dom.getElementById("list")!, "ArrowDown"));
      flushKeyPressBurstForTests();

      const log = lastLog();
      expect(log.body).toEqual({ stringValue: 'Press ArrowDown in "Results" on /' });
      expect(attr(log, INTERACTION_REPEAT_COUNT)).toBeUndefined();
    });

    it("emits Enter immediately, and flushes a pending burst ahead of it to keep press order", () => {
      dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;
      const input = dom.getElementById("q")!;

      handleKeydown(keydownOn(input, "Backspace"));
      handleKeydown(keydownOn(input, "Enter"));

      // Enter must not wait on a settle timer: it is the key most likely to have
      // caused the request that follows.
      const [first, second] = (sendLog as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as LogRecord);
      expect(sendLog).toHaveBeenCalledTimes(2);
      expect(attr(first!, INTERACTION_KEY)).toEqual({ stringValue: "Backspace" });
      expect(attr(second!, INTERACTION_KEY)).toEqual({ stringValue: "Enter" });
    });

    it("finalizes the pending burst when a different key is pressed", () => {
      dom.body.innerHTML = `<textarea id="notes" placeholder="Notes"></textarea>`;
      const notes = dom.getElementById("notes")!;

      handleKeydown(keydownOn(notes, "Backspace"));
      handleKeydown(keydownOn(notes, "Backspace"));
      handleKeydown(keydownOn(notes, "Delete"));

      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_REPEAT_COUNT)).toEqual({ doubleValue: 2 });

      flushKeyPressBurstForTests();
      expect(attr(lastLog(), INTERACTION_KEY)).toEqual({ stringValue: "Delete" });
    });

    it("finalizes the pending burst when the same key is pressed on a different element", () => {
      dom.body.innerHTML = `
        <input id="first" aria-label="First" />
        <input id="second" aria-label="Second" />`;

      handleKeydown(keydownOn(dom.getElementById("first")!, "Tab"));
      handleKeydown(keydownOn(dom.getElementById("second")!, "Tab"));

      expect(sendLog).toHaveBeenCalledOnce();
      expect(lastLog().body).toEqual({ stringValue: 'Press Tab in "First" on /' });
    });

    it("keeps one correlation id across a coalesced activation burst, so attributed spans join to the emitted event", () => {
      dom.body.innerHTML = `<button id="b" aria-label="Play"></button>`;
      const button = dom.getElementById("b")!;

      handleKeydown(keydownOn(button, " "));
      const firstId = getActiveInteraction()!.id;

      handleKeydown(keydownOn(button, " "));
      const secondId = getActiveInteraction()!.id;

      // Minting a fresh id per press would leave the spans attributed to the
      // first one pointing at a log record that never gets emitted.
      expect(secondId).toBe(firstId);

      flushKeyPressBurstForTests();
      expect(attr(lastLog(), INTERACTION_ID)).toEqual({ stringValue: firstId });
    });

    /**
     * The only test here that drives the production settle timer instead of
     * calling flushKeyPressBurstForTests(); without it, deleting the setTimeout
     * in handleKeydown would keep every other test in this file green.
     *
     * It really does wait: utils/timers captures win.setTimeout at module load,
     * so vi.useFakeTimers() cannot intercept the timer this code schedules.
     */
    it("emits after the settle timer, with no test-only flush", async () => {
      dom.body.innerHTML = `<div id="list" tabindex="0" aria-label="Results"></div>`;

      handleKeydown(keydownOn(dom.getElementById("list")!, "ArrowDown"));
      expect(sendLog).not.toHaveBeenCalled();

      await new Promise((resolve) => globalThis.setTimeout(resolve, KEYPRESS_SETTLE_MILLIS + 50));

      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_KEY)).toEqual({ stringValue: "ArrowDown" });
    });
  });

  describe("startKeyPressInstrumentation (real capture-phase listener + isTrusted gate)", () => {
    /**
     * Filtered by event type rather than asserting a total call count: the
     * unload hook also registers window-level pagehide/beforeunload listeners,
     * and it registers only on the *first* start* in this file, so any count
     * over all registrations would depend on test order. Same shape as
     * scroll_test.ts.
     */
    function keydownRegistrations(addSpy: ReturnType<typeof vi.spyOn>) {
      return addSpy.mock.calls.filter((call) => call[0] === "keydown");
    }

    it("registers exactly one window-level capture-phase keydown listener", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startKeyPressInstrumentation();

      expect(keydownRegistrations(addSpy)).toHaveLength(1);
      expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });

      addSpy.mockRestore();
    });

    it("does not register a second listener if called twice (idempotent start)", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startKeyPressInstrumentation();
      startKeyPressInstrumentation();

      expect(keydownRegistrations(addSpy)).toHaveLength(1);
      addSpy.mockRestore();
    });

    it("ignores untrusted (synthetic) key presses -- jsdom's dispatchEvent always yields isTrusted: false", () => {
      dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;
      startKeyPressInstrumentation();

      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
      dom.getElementById("q")!.dispatchEvent(event);

      expect(event.isTrusted).toBe(false);
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("processes a key press when isTrusted is stubbed true, proving the gate is the only thing blocking synthetic key presses", () => {
      // jsdom defines `isTrusted` as a non-configurable accessor on its Event
      // prototype, so there is no way to construct a pre-trusted event -- see the
      // long-form explanation in click_test.ts. Capture the real listener
      // registered by startKeyPressInstrumentation and invoke it directly instead.
      dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;
      const addSpy = vi.spyOn(globalWindow, "addEventListener");
      startKeyPressInstrumentation();

      const target = dom.getElementById("q")!;
      const listener = addSpy.mock.calls.find((call) => call[0] === "keydown")![1] as EventListener;
      listener({ isTrusted: true, target, key: "Enter", repeat: false } as unknown as Event);

      addSpy.mockRestore();
      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_KEY)).toEqual({ stringValue: "Enter" });
    });
  });
});
