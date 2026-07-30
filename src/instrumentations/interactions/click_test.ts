import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import {
  EVENT_NAME,
  EVENT_NAMES,
  INTERACTION_ID,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_ID,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TYPE,
  LOG_SEVERITIES,
  PAGE_URL_ATTR_PREFIX,
  URL_FULL,
  URL_PATH,
  WEB_EVENT_ID,
} from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";
import type { UrlAttributeScrubber } from "../../attributes/url";
import { identity } from "../../utils";
import { withPrefix } from "../../utils/otel";

const PAGE_URL_PATH = withPrefix(PAGE_URL_ATTR_PREFIX)(URL_PATH);

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { handleClick, startClickInstrumentation, stopClickInstrumentationForTests } from "./click";
import { clearActiveInteractionForTests, getActiveInteraction } from "./active-interaction";

// Vitest runs these tests in jsdom, so the SSR-safe doc/win are always defined.
const dom = doc!;
const globalWindow = win!;

function dispatchClick(target: Element) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/**
 * Dispatches one click and feeds every click event it produces to `handleClick`,
 * in dispatch order -- exactly what the production listener does, minus the
 * `isTrusted` gate. jsdom implements a `<label>`'s activation behavior, so a
 * click inside a label really does produce a second event at the labeled
 * control here, the same duplicate every browser emits. Returns the events seen
 * so a test can assert the duplication happened at all.
 */
function dispatchClickThroughListener(target: Element): Event[] {
  const seen: Event[] = [];
  const collect = (event: Event) => {
    seen.push(event);
    handleClick(event);
  };

  globalWindow.addEventListener("click", collect, { capture: true });
  try {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  } finally {
    globalWindow.removeEventListener("click", collect, { capture: true } as EventListenerOptions);
  }

  return seen;
}

describe("click instrumentation", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopClickInstrumentationForTests();
    clearActiveInteractionForTests();
    vi.clearAllMocks();
  });

  function lastLog(): LogRecord {
    const calls = (sendLog as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1]![0] as LogRecord;
  }

  describe("handleClick (direct, bypasses isTrusted gate)", () => {
    it("emits exactly one log per click with the full expected attribute set", () => {
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Save Settings">Save</button>`;
      const target = dom.getElementById("btn")!;

      handleClick(dispatchClick(target));

      expect(sendLog).toHaveBeenCalledOnce();
      const log = lastLog();

      expect(log.severityNumber).toBe(LOG_SEVERITIES.INFO);
      expect(log.severityText).toBe("INFO");
      expect(typeof log.timeUnixNano).toBe("string");

      expect(log.attributes).toEqual(
        expect.arrayContaining([
          { key: WEB_EVENT_ID, value: { stringValue: expect.any(String) } },
          { key: EVENT_NAME, value: { stringValue: EVENT_NAMES.INTERACTION } },
          { key: INTERACTION_ID, value: { stringValue: expect.stringMatching(/^[0-9a-f]{16}$/) } },
          { key: INTERACTION_TYPE, value: { stringValue: "click" } },
          { key: INTERACTION_NAME, value: { stringValue: "Save Settings" } },
          { key: INTERACTION_NAME_SOURCE, value: { stringValue: "custom_attribute" } },
          { key: INTERACTION_TARGET_SELECTOR, value: { stringValue: "button#btn" } },
          { key: INTERACTION_TARGET_TAG, value: { stringValue: "button" } },
          { key: INTERACTION_TARGET_ID, value: { stringValue: "btn" } },
        ])
      );

      // The body is the plain human-readable summary -- UIs without a
      // dedicated browser.interaction renderer display it as-is.
      expect(log.body).toEqual({ stringValue: 'Click "Save Settings" on /' });
    });

    it("titles an unnamed click with the target tag instead of dumping its text content", () => {
      dom.body.innerHTML = `<div id="page" class="page">Lots of page prose that must not become the title</div>`;
      handleClick(dispatchClick(dom.getElementById("page")!));

      const log = lastLog();
      expect(log.body).toEqual({ stringValue: "Click div on /" });
      expect(log.attributes).toEqual(
        expect.arrayContaining([
          { key: INTERACTION_NAME, value: { stringValue: "" } },
          { key: INTERACTION_NAME_SOURCE, value: { stringValue: "blank" } },
        ])
      );
    });

    it("registers the click as the active interaction so HTTP spans can be attributed to it", () => {
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Fire Requests">Go</button>`;
      handleClick(dispatchClick(dom.getElementById("btn")!));

      const log = lastLog();
      const eventId = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_ID
      )!.value.stringValue;

      const active = getActiveInteraction();
      expect(active).toBeDefined();
      expect(active!.name).toBe("Fire Requests");
      // The event's interaction.id and the id stamped onto spans are the same
      // value -- that shared id is what joins a click to the requests it
      // triggered.
      expect(active!.id).toBe(eventId);
    });

    it("addCommonAttributes attributes come before EVENT_NAME, matching the errors/index.ts structural template", () => {
      dom.body.innerHTML = `<button id="btn">Click</button>`;
      handleClick(dispatchClick(dom.getElementById("btn")!));

      const log = lastLog();
      const eventNameIndex = log.attributes.findIndex((a) => a.key === EVENT_NAME);
      const webEventIdIndex = log.attributes.findIndex((a) => a.key === WEB_EVENT_ID);

      expect(webEventIdIndex).toBeGreaterThanOrEqual(0);
      expect(eventNameIndex).toBeGreaterThan(webEventIdIndex);
    });

    it("omits target.id when the element has no id", () => {
      dom.body.innerHTML = `<button class="cta">Click</button>`;
      handleClick(dispatchClick(dom.querySelector(".cta")!));

      const log = lastLog();
      const keys = (log.attributes as { key: string }[]).map((kv) => kv.key);
      expect(keys).not.toContain(INTERACTION_TARGET_ID);
    });

    it("derives a compact selector: tag + #id when id is present", () => {
      dom.body.innerHTML = `<div id="card" class="card highlighted"><span id="inner">x</span></div>`;
      handleClick(dispatchClick(dom.getElementById("inner")!));

      const log = lastLog();
      const selector = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe("span#inner");
    });

    it("derives a compact selector: tag + first class when no id is present", () => {
      dom.body.innerHTML = `<button class="btn-primary large">Click</button>`;
      handleClick(dispatchClick(dom.querySelector(".btn-primary")!));

      const log = lastLog();
      const selector = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe("button.btn-primary");
    });

    it("caps the selector length on the id-anchored path, same as the ancestor-walk path", () => {
      // Regression: the tag#id fast path must go through the same
      // MAX_SELECTOR_LENGTH (128) truncation as the ancestor-walk branch.
      const longId = "x".repeat(200);
      dom.body.innerHTML = `<button id="${longId}">Click</button>`;
      handleClick(dispatchClick(dom.getElementById(longId)!));

      const log = lastLog();
      const selector = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe(`button#${longId}`.substring(0, 128));
      expect(selector?.value.stringValue.length).toBe(128);
    });

    it("never includes body/html segments in the selector for a shallow element with no id", () => {
      // Locks in SELECTOR_BOUNDARY_TAGS: the ancestor walk stops before
      // crossing into document-structure elements.
      dom.body.innerHTML = `<span class="lonely">x</span>`;
      handleClick(dispatchClick(dom.querySelector(".lonely")!));

      const log = lastLog();
      const selector = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe("span.lonely");
    });

    it("walks up to 3 ancestors joined with ' > ' when no id is present anywhere in the path", () => {
      dom.body.innerHTML = `
        <div class="outer">
          <div class="middle">
            <span class="inner">x</span>
          </div>
        </div>`;
      handleClick(dispatchClick(dom.querySelector(".inner")!));

      const log = lastLog();
      const selector = (log.attributes as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe("div.outer > div.middle > span.inner");
    });

    it("does not emit a log when target is not an Element (e.g. a text node)", () => {
      dom.body.innerHTML = `<div id="wrap">text</div>`;
      const textNode = dom.getElementById("wrap")!.firstChild!;

      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: textNode });

      handleClick(event);

      expect(sendLog).not.toHaveBeenCalled();
    });

    it("swallows errors from a throwing scenario and does not propagate", () => {
      dom.body.innerHTML = `<button id="btn">Click</button>`;
      const target = dom.getElementById("btn")!;
      // Force an internal error by making the first DOM read of the derivation
      // throw (name derivation no longer touches textContent -- see labelText
      // in action-name.ts).
      Object.defineProperty(target, "getAttribute", {
        value() {
          throw new Error("boom");
        },
      });

      expect(() => handleClick(dispatchClick(target))).not.toThrow();
      expect(sendLog).not.toHaveBeenCalled();
    });
  });

  // Clicking a <label> makes the browser fire a second, also trusted, click at
  // the labeled control: one gesture, two events reaching a window-level
  // capture listener. Both the wrapping shape and <label for="..."> are covered
  // because the control is a descendant of the label in the first and not in
  // the second -- a containment test would only ever see the first, and only
  // when the click landed on the label element itself rather than on something
  // inside it.
  describe("label-forwarded duplicate clicks", () => {
    function logCount(): number {
      return (sendLog as ReturnType<typeof vi.fn>).mock.calls.length;
    }

    function attribute(log: LogRecord, key: string): string | undefined {
      return (log.attributes as { key: string; value: { stringValue: string } }[]).find((kv) => kv.key === key)?.value
        .stringValue;
    }

    it("emits one event for a click on a span inside a label wrapping its control", () => {
      // The shape of the e2e fixture: the click target is an inner span, so the
      // forwarded target (the textarea) is its sibling, not its descendant.
      dom.body.innerHTML = `
        <label id="notes-label"
          ><span id="notes-label-text">Notes</span>
          <textarea id="notes"></textarea>
        </label>`;

      const seen = dispatchClickThroughListener(dom.getElementById("notes-label-text")!);

      // Guards the premise: without two events there is nothing to coalesce and
      // the rest of this test would pass for the wrong reason.
      expect(seen.map((event) => (event.target as Element).id)).toEqual(["notes-label-text", "notes"]);
      expect(sendLog).toHaveBeenCalledOnce();
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("notes-label-text");
    });

    it("emits one event for a label whose control lives outside it (label for=)", () => {
      dom.body.innerHTML = `
        <label id="terms-label" for="terms">Accept terms</label>
        <div><input id="terms" type="checkbox" /></div>`;

      const seen = dispatchClickThroughListener(dom.getElementById("terms-label")!);

      expect(seen.map((event) => (event.target as Element).id)).toEqual(["terms-label", "terms"]);
      expect(sendLog).toHaveBeenCalledOnce();
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("terms-label");
    });

    it("keeps the surviving event's id as the active interaction, so spans join to a log that exists", () => {
      dom.body.innerHTML = `
        <label id="terms-label" for="terms">Accept terms</label>
        <div><input id="terms" type="checkbox" /></div>`;

      dispatchClickThroughListener(dom.getElementById("terms-label")!);

      // The suppressed click must not have overwritten the registration: the
      // forwarded control click never calls registerActiveInteraction.
      expect(getActiveInteraction()!.id).toBe(attribute(lastLog(), INTERACTION_ID));
      expect(getActiveInteraction()!.name).toBe("Accept terms");
    });

    it("emits for a click that lands on the control itself, which is never forwarded again", () => {
      dom.body.innerHTML = `
        <label id="terms-label"><input id="terms" type="checkbox" /> Accept terms</label>`;

      const seen = dispatchClickThroughListener(dom.getElementById("terms")!);

      // A label's activation behavior does nothing for events targeted at its
      // interactive content descendants, so there is no duplicate to drop here.
      expect(seen).toHaveLength(1);
      expect(sendLog).toHaveBeenCalledOnce();
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("terms");
    });

    it("does not latch: each successive gesture on the same label emits its own event", () => {
      dom.body.innerHTML = `
        <label id="terms-label" for="terms">Accept terms</label>
        <div><input id="terms" type="checkbox" /></div>`;
      const label = dom.getElementById("terms-label")!;

      dispatchClickThroughListener(label);
      const firstId = attribute(lastLog(), INTERACTION_ID);
      dispatchClickThroughListener(label);

      expect(logCount()).toBe(2);
      expect(attribute(lastLog(), INTERACTION_ID)).not.toBe(firstId);
    });

    it("emits a genuine click on the control once the forward window has elapsed", () => {
      dom.body.innerHTML = `
        <label id="terms-label" for="terms">Accept terms</label>
        <div><input id="terms" type="checkbox" /></div>`;
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);

      try {
        // dispatchClick (not the listener helper) so only the label's own click
        // is handled -- the forwarded one is dropped by the browser here, as it
        // would be for a disabled control.
        handleClick(dispatchClick(dom.getElementById("terms-label")!));
        // Later than any same-task forward could be: a deliberate second click.
        nowSpy.mockReturnValue(1_051);
        handleClick(dispatchClick(dom.getElementById("terms")!));
      } finally {
        nowSpy.mockRestore();
      }

      expect(logCount()).toBe(2);
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("terms");
    });

    it("leaves no marker behind for a label with no labeled control", () => {
      dom.body.innerHTML = `
        <label id="orphan-label" for="missing">Nothing to activate</label>
        <button id="btn">Go</button>`;

      dispatchClickThroughListener(dom.getElementById("orphan-label")!);
      dispatchClickThroughListener(dom.getElementById("btn")!);

      expect(logCount()).toBe(2);
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("btn");
    });

    it("emits a keyboard-activated click on a labeled control, which carries no preceding label click", () => {
      // Keyboard activation of a button produces a click with detail 0, the same
      // marker a label-forwarded click carries in some browsers -- which is why
      // the suppression keys off the preceding label click rather than `detail`.
      dom.body.innerHTML = `
        <label id="submit-label" for="submit-button">Submit</label>
        <button id="submit-button">Go</button>`;
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
      dom.getElementById("submit-button")!.dispatchEvent(event);

      handleClick(event);

      expect(sendLog).toHaveBeenCalledOnce();
      expect(attribute(lastLog(), INTERACTION_TARGET_ID)).toBe("submit-button");
    });
  });

  describe("startClickInstrumentation (real capture-phase listener + isTrusted gate)", () => {
    it("registers exactly one window-level capture-phase click listener", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startClickInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
      expect(addSpy).toHaveBeenCalledWith("click", expect.any(Function), { capture: true });

      addSpy.mockRestore();
    });

    it("ignores untrusted (synthetic) clicks -- jsdom's dispatchEvent always yields isTrusted: false", () => {
      dom.body.innerHTML = `<button id="btn">Click</button>`;
      startClickInstrumentation();

      const target = dom.getElementById("btn")!;
      const event = dispatchClick(target);

      // jsdom, like real browsers, never sets isTrusted: true for dispatchEvent --
      // this assertion documents and locks in that guard behavior.
      expect(event.isTrusted).toBe(false);
      expect(sendLog).not.toHaveBeenCalled();
    });

    it("processes a click when isTrusted is stubbed true, proving the gate is the only thing blocking synthetic clicks", () => {
      // jsdom (v26, pinned in this repo) defines `isTrusted` as a non-configurable
      // accessor on its Event prototype, so `Object.defineProperty` on a real
      // dispatched event throws "Cannot redefine property: isTrusted" -- there is
      // no public jsdom API to construct a pre-trusted event. Instead, capture the
      // real capture-phase listener registered by `startClickInstrumentation` and
      // invoke it directly with a minimal object shaped like a trusted click
      // event. This still exercises the real production listener function (not a
      // reimplementation of it), only substituting jsdom's event construction.
      dom.body.innerHTML = `<button id="btn">Click</button>`;
      const addSpy = vi.spyOn(globalWindow, "addEventListener");
      startClickInstrumentation();

      const target = dom.getElementById("btn")!;
      const listener = addSpy.mock.calls.find((call) => call[0] === "click")![1] as EventListener;
      listener({ isTrusted: true, target } as unknown as Event);

      addSpy.mockRestore();
      expect(sendLog).toHaveBeenCalledOnce();
    });

    it("does not register a second listener if called twice (idempotent start)", () => {
      const addSpy = vi.spyOn(globalWindow, "addEventListener");

      startClickInstrumentation();
      startClickInstrumentation();

      expect(addSpy).toHaveBeenCalledOnce();
      addSpy.mockRestore();
    });
  });

  // The page path in the body must come from the scrubbed `page.url.path`
  // attribute, never from a raw `location.pathname` read -- otherwise a
  // consumer's urlAttributeScrubber redacts the attribute while the free-text
  // body still leaks the segment, and free text cannot be scrubbed downstream.
  describe("page path in the body", () => {
    const RAW_PATH = "/invoices/acme-corp/4471";

    beforeEach(() => {
      globalWindow.history.pushState({}, "", RAW_PATH);
    });

    afterEach(() => {
      globalWindow.history.pushState({}, "", "/");
      vars.urlAttributeScrubber = identity;
      vars.signalAttributes = [];
    });

    function clickAndGetBody(): string {
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Save">Save</button>`;
      handleClick(dispatchClick(dom.getElementById("btn")!));
      return (lastLog().body as { stringValue: string }).stringValue;
    }

    it("renders the scrubbed path rather than the raw location.pathname", () => {
      vars.urlAttributeScrubber = ((attrs) => ({
        ...attrs,
        [URL_PATH]: "/invoices/REDACTED/4471",
      })) satisfies UrlAttributeScrubber;

      // Sanity check: the raw path really is present on `location`, so the
      // assertions below prove the body did not read it.
      expect(globalWindow.location.pathname).toBe(RAW_PATH);

      const body = clickAndGetBody();

      expect(body).toBe('Click "Save" on /invoices/REDACTED/4471');
      expect(body).not.toContain("acme-corp");
      // The body and the attribute must agree -- both come from one scrub.
      expect(lastLog().attributes).toEqual(
        expect.arrayContaining([{ key: PAGE_URL_PATH, value: { stringValue: "/invoices/REDACTED/4471" } }])
      );
    });

    it("omits the path suffix entirely when the scrubber drops url.path", () => {
      vars.urlAttributeScrubber = ((attrs) => ({ [URL_FULL]: attrs[URL_FULL] })) satisfies UrlAttributeScrubber;

      // A scrubber that dropped the path asked for it gone; there is no
      // fallback to location.pathname.
      expect(clickAndGetBody()).toBe('Click "Save"');
    });

    it("omits the path suffix when the scrubber throws", () => {
      vars.urlAttributeScrubber = (() => {
        throw new Error("scrubber boom");
      }) satisfies UrlAttributeScrubber;

      const body = clickAndGetBody();

      expect(body).toBe('Click "Save"');
      expect(body).not.toContain("acme-corp");
    });

    it("prefers the derived page.url.path over a same-keyed signal attribute", () => {
      // signalAttributes are spliced in *before* the url block, so a forward
      // scan would pick this up instead of the real, scrubbed value.
      vars.signalAttributes = [{ key: PAGE_URL_PATH, value: { stringValue: "/spoofed" } }];

      expect(clickAndGetBody()).toBe(`Click "Save" on ${RAW_PATH}`);
    });
  });
});
