import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import { INTERACTION_KEY, INTERACTION_TYPE } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { handleKeydown, startKeyPressInstrumentation, stopKeyPressInstrumentationForTests } from "./keypress";
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

    expect(sendLog).toHaveBeenCalledOnce();
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
    // the handler touches (same lever as click_test.ts).
    Object.defineProperty(input, "getAttribute", {
      value() {
        throw new Error("boom");
      },
    });

    expect(() => handleKeydown(keydownOn(input, "Enter"))).not.toThrow();

    expect(sendLog).not.toHaveBeenCalled();
    // Name derivation runs before registerActiveInteraction, so a throw must not
    // leave an interaction id behind for HTTP spans to join to.
    expect(getActiveInteraction()).toBeUndefined();
  });

  describe("startKeyPressInstrumentation (real capture-phase listener + isTrusted gate)", () => {
    it("registers exactly one window-level capture-phase keydown listener", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startKeyPressInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
      expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });

      addSpy.mockRestore();
    });

    it("does not register a second listener if called twice (idempotent start)", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startKeyPressInstrumentation();
      startKeyPressInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
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
