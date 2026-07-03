import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc, win } from "../../utils/globals";
import {
  EVENT_NAME,
  EVENT_NAMES,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_ID,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TYPE,
  LOG_SEVERITIES,
} from "../../semantic-conventions";
import { WEB_EVENT_ID } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { handleClick, startClickInstrumentation, stopClickInstrumentationForTests } from "./click";

// Vitest runs these tests in jsdom, so the SSR-safe doc/win are always defined.
const dom = doc!;
const globalWindow = win!;

function dispatchClick(target: Element) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("click instrumentation", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopClickInstrumentationForTests();
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
        ])
      );

      expect(log.body).toEqual({
        kvlistValue: {
          values: expect.arrayContaining([
            { key: INTERACTION_TYPE, value: { stringValue: "click" } },
            { key: INTERACTION_NAME, value: { stringValue: "Save Settings" } },
            { key: INTERACTION_NAME_SOURCE, value: { stringValue: "custom_attribute" } },
            { key: INTERACTION_TARGET_SELECTOR, value: { stringValue: "button#btn" } },
            { key: INTERACTION_TARGET_TAG, value: { stringValue: "button" } },
            { key: INTERACTION_TARGET_ID, value: { stringValue: "btn" } },
          ]),
        },
      });
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
      const values = (log.body!.kvlistValue!.values as { key: string }[]).map((kv) => kv.key);
      expect(values).not.toContain(INTERACTION_TARGET_ID);
    });

    it("derives a compact selector: tag + #id when id is present", () => {
      dom.body.innerHTML = `<div id="card" class="card highlighted"><span id="inner">x</span></div>`;
      handleClick(dispatchClick(dom.getElementById("inner")!));

      const log = lastLog();
      const selector = (log.body!.kvlistValue!.values as { key: string; value: { stringValue: string } }[]).find(
        (kv) => kv.key === INTERACTION_TARGET_SELECTOR
      );
      expect(selector?.value.stringValue).toBe("span#inner");
    });

    it("derives a compact selector: tag + first class when no id is present", () => {
      dom.body.innerHTML = `<button class="btn-primary large">Click</button>`;
      handleClick(dispatchClick(dom.querySelector(".btn-primary")!));

      const log = lastLog();
      const selector = (log.body!.kvlistValue!.values as { key: string; value: { stringValue: string } }[]).find(
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
      const selector = (log.body!.kvlistValue!.values as { key: string; value: { stringValue: string } }[]).find(
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
      const selector = (log.body!.kvlistValue!.values as { key: string; value: { stringValue: string } }[]).find(
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
      const selector = (log.body!.kvlistValue!.values as { key: string; value: { stringValue: string } }[]).find(
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
      // Force an internal error by making textContent throw.
      Object.defineProperty(target, "textContent", {
        get() {
          throw new Error("boom");
        },
      });

      expect(() => handleClick(dispatchClick(target))).not.toThrow();
      expect(sendLog).not.toHaveBeenCalled();
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
});
