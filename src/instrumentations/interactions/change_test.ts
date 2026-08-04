import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import { nowNanos } from "../../utils";
import {
  INTERACTION_ID,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_SELECTED_COUNT,
  INTERACTION_TYPE,
  INTERACTION_VALUE_LENGTH,
} from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import {
  CHANGE_SETTLE_MILLIS,
  flushPendingChangeForTests,
  handleChange,
  startChangeInstrumentation,
  stopChangeInstrumentationForTests,
} from "./change";
import { clearActiveInteractionForTests, getActiveInteraction } from "./active-interaction";

// Vitest runs these tests in jsdom, so the SSR-safe doc/win are always defined.
const dom = doc!;
const globalWindow = win!;

function changeEventFor(el: Element): Event {
  const event = new Event("change", { bubbles: true });
  Object.defineProperty(event, "target", { value: el });
  return event;
}

/**
 * Commits a change and closes the coalescing window, which is what the settle
 * timer does 300 ms later. Tests about the coalescing itself call handleChange
 * directly instead.
 */
function change(el: Element): void {
  handleChange(changeEventFor(el));
  flushPendingChangeForTests();
}

function lastLog(): LogRecord {
  const calls = (sendLog as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0] as LogRecord;
}

function attr(log: LogRecord, key: string) {
  return (log.attributes as { key: string; value: Record<string, unknown> }[]).find((kv) => kv.key === key)?.value;
}

describe("change instrumentation", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopChangeInstrumentationForTests();
    clearActiveInteractionForTests();
    // Restores any addEventListener spy even when an assertion failed before the
    // test reached its own mockRestore, so the spy cannot leak into the next case.
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reports only the value LENGTH for text inputs, never the value", () => {
    dom.body.innerHTML = `<input id="email" type="text" aria-label="Email" />`;
    const input = dom.getElementById("email") as HTMLInputElement;
    input.value = "user@example.com"; // 16 characters of user data

    change(input);

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Change "Email" to 16 characters on /' });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 16 });
    expect(attr(log, INTERACTION_TYPE)).toEqual({ stringValue: "change" });
    // the raw value must not appear anywhere in the record
    expect(JSON.stringify(log)).not.toContain("user@example.com");
  });

  it("reports neither value nor length for password inputs", () => {
    dom.body.innerHTML = `<input id="pw" type="password" aria-label="Password" />`;
    const input = dom.getElementById("pw") as HTMLInputElement;
    input.value = "hunter2";

    change(input);

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Change "Password" on /' });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toBeUndefined();
    expect(JSON.stringify(log)).not.toContain("hunter2");
  });

  it("reports the selected COUNT for selects, never the chosen option", () => {
    dom.body.innerHTML = `
      <select id="country" aria-label="Country">
        <option value="secret-country" selected>Secret Country</option>
        <option value="other">Other</option>
      </select>`;
    const select = dom.getElementById("country")!;

    change(select);

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Change "Country" to 1 selected on /' });
    expect(attr(log, INTERACTION_SELECTED_COUNT)).toEqual({ doubleValue: 1 });
    expect(JSON.stringify(log)).not.toContain("Secret Country");
    expect(JSON.stringify(log)).not.toContain("secret-country");
  });

  it("reports checkbox changes as a toggle with no value", () => {
    dom.body.innerHTML = `<input id="sub" type="checkbox" aria-label="Subscribe" />`;
    const box = dom.getElementById("sub") as HTMLInputElement;
    box.checked = true;

    change(box);

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Toggle "Subscribe" on /' });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toBeUndefined();
  });

  it("ignores change events from non-form elements", () => {
    dom.body.innerHTML = `<div id="d"></div>`;
    change(dom.getElementById("d")!);

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("registers the change as the active interaction for span attribution", () => {
    dom.body.innerHTML = `<select id="c" aria-label="Country"><option selected>A</option></select>`;
    change(dom.getElementById("c")!);

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("Country");
  });

  it("names the field via naming attributes and records the source", () => {
    dom.body.innerHTML = `<textarea id="notes" placeholder="Notes"></textarea>`;
    const ta = dom.getElementById("notes") as HTMLTextAreaElement;
    ta.value = "abc";

    change(ta);

    const log = lastLog();
    expect(attr(log, INTERACTION_NAME)).toEqual({ stringValue: "Notes" });
    expect(attr(log, INTERACTION_NAME_SOURCE)).toEqual({ stringValue: "standard_attribute" });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 3 });
  });

  it("swallows errors from a throwing scenario and does not propagate", () => {
    dom.body.innerHTML = `<input id="email" type="text" aria-label="Email" />`;
    const input = dom.getElementById("email")!;
    // The length read is the last DOM access in the handler, so a throwing value
    // getter exercises the catch without short-circuiting anything before it.
    Object.defineProperty(input, "value", {
      get() {
        throw new Error("boom");
      },
    });

    expect(() => change(input)).not.toThrow();

    expect(sendLog).not.toHaveBeenCalled();
  });

  describe("coalescing", () => {
    function textInput(id: string, label: string): HTMLInputElement {
      dom.body.insertAdjacentHTML("beforeend", `<input id="${id}" type="text" aria-label="${label}" />`);
      return dom.getElementById(id) as HTMLInputElement;
    }

    it("collapses successive changes to one control into a single event describing its latest state", () => {
      const input = textInput("email", "Email");

      for (const value of ["a", "ab", "abc"]) {
        input.value = value;
        handleChange(changeEventFor(input));
      }
      expect(sendLog).not.toHaveBeenCalled(); // settle timer still pending
      flushPendingChangeForTests();

      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 3 });
    });

    it("emits the pending change immediately when a different control changes, preserving edit order", () => {
      const email = textInput("email", "Email");
      const notes = textInput("notes", "Notes");

      email.value = "user@example.com";
      handleChange(changeEventFor(email));
      notes.value = "hi";
      handleChange(changeEventFor(notes));

      // The second control's change flushed the first one rather than replacing it.
      expect(sendLog).toHaveBeenCalledOnce();
      expect(lastLog().body).toEqual({ stringValue: 'Change "Email" to 16 characters on /' });

      flushPendingChangeForTests();
      expect(sendLog).toHaveBeenCalledTimes(2);
      expect(lastLog().body).toEqual({ stringValue: 'Change "Notes" to 2 characters on /' });
    });

    it("keeps one correlation id across a coalesced run, so attributed spans join to the emitted event", () => {
      const input = textInput("email", "Email");

      input.value = "a";
      handleChange(changeEventFor(input));
      const firstId = getActiveInteraction()!.id;

      input.value = "ab";
      handleChange(changeEventFor(input));
      const secondId = getActiveInteraction()!.id;

      // Minting a fresh id per change would leave the spans attributed to the
      // first one pointing at a log record that never gets emitted.
      expect(secondId).toBe(firstId);

      flushPendingChangeForTests();
      expect(attr(lastLog(), INTERACTION_ID)).toEqual({ stringValue: firstId });
    });

    it("reports the value length read at event time, not at emission time", () => {
      const input = textInput("email", "Email");
      input.value = "user@example.com";

      handleChange(changeEventFor(input));
      // Whatever happens to the field afterwards -- reset, detached modal, route
      // change -- must not change what the pending event reports.
      input.value = "";

      flushPendingChangeForTests();
      expect(attr(lastLog(), INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 16 });
    });

    /**
     * The only test here that drives the production settle timer instead of
     * calling flushPendingChangeForTests(); without it, deleting the setTimeout
     * in handleChange would keep every other test in this file green.
     *
     * It really does wait: utils/timers captures win.setTimeout at module load,
     * so vi.useFakeTimers() cannot intercept the timer this code schedules.
     */
    it("emits after the settle timer, with no test-only flush", async () => {
      const input = textInput("email", "Email");
      input.value = "abc";

      handleChange(changeEventFor(input));
      expect(sendLog).not.toHaveBeenCalled();

      await new Promise((resolve) => globalThis.setTimeout(resolve, CHANGE_SETTLE_MILLIS + 50));

      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 3 });
    });

    it("timestamps the event when the run started, not when the settle timer fired", async () => {
      const input = textInput("email", "Email");
      input.value = "abc";

      handleChange(changeEventFor(input));
      await new Promise((resolve) => globalThis.setTimeout(resolve, CHANGE_SETTLE_MILLIS + 50));

      // A coalesced change and a coalesced key press settle on independent
      // timers, so only an event-time stamp keeps them orderable against each
      // other downstream.
      const elapsedNanos = BigInt(nowNanos()) - BigInt(lastLog().timeUnixNano!);
      expect(elapsedNanos).toBeGreaterThan(BigInt(CHANGE_SETTLE_MILLIS) * 1_000_000n);
    });
  });

  describe("startChangeInstrumentation (real capture-phase listener + isTrusted gate)", () => {
    /**
     * Filtered by event type rather than asserting a total call count: the
     * unload hook also registers window-level pagehide/beforeunload listeners,
     * and it registers only on the *first* start* in this file, so any count
     * over all registrations would depend on test order. Same shape as
     * scroll_test.ts.
     */
    function changeRegistrations(addSpy: ReturnType<typeof vi.spyOn>) {
      return addSpy.mock.calls.filter((call) => call[0] === "change");
    }

    it("registers exactly one window-level capture-phase change listener", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startChangeInstrumentation();

      expect(changeRegistrations(addSpy)).toHaveLength(1);
      expect(addSpy).toHaveBeenCalledWith("change", expect.any(Function), { capture: true });

      addSpy.mockRestore();
    });

    it("does not register a second listener if called twice (idempotent start)", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startChangeInstrumentation();
      startChangeInstrumentation();

      expect(changeRegistrations(addSpy)).toHaveLength(1);
      addSpy.mockRestore();
    });

    it("ignores untrusted (synthetic) changes -- jsdom's dispatchEvent always yields isTrusted: false", () => {
      dom.body.innerHTML = `<input id="email" type="text" aria-label="Email" />`;
      startChangeInstrumentation();

      const event = new Event("change", { bubbles: true });
      dom.getElementById("email")!.dispatchEvent(event);

      expect(event.isTrusted).toBe(false);
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("processes a change when isTrusted is stubbed true, proving the gate is the only thing blocking synthetic changes", () => {
      // jsdom defines `isTrusted` as a non-configurable accessor on its Event
      // prototype, so there is no way to construct a pre-trusted event -- see the
      // long-form explanation in click_test.ts. Capture the real listener
      // registered by startChangeInstrumentation and invoke it directly instead.
      dom.body.innerHTML = `<input id="email" type="text" aria-label="Email" />`;
      const input = dom.getElementById("email") as HTMLInputElement;
      input.value = "abc";
      const addSpy = vi.spyOn(globalWindow, "addEventListener");
      startChangeInstrumentation();

      const listener = addSpy.mock.calls.find((call) => call[0] === "change")![1] as EventListener;
      listener({ isTrusted: true, target: input } as unknown as Event);
      flushPendingChangeForTests();

      addSpy.mockRestore();
      expect(sendLog).toHaveBeenCalledOnce();
      expect(attr(lastLog(), INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 3 });
    });
  });
});
