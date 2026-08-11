import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS, vars } from "../../vars";
import { MAX_TRANSPORT_CALLS_PER_TEN_SECONDS } from "../../transport/limits";
import { sendLog } from "../../transport";
import { doc } from "../../utils/globals";
import { INTERACTION_TARGET_ID, INTERACTION_TARGET_SELECTOR, INTERACTION_TARGET_TAG } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { buildSelector, emitInteractionEvent, resetInteractionRateLimiterForTests } from "./emit";

// Vitest runs these tests in jsdom, so the SSR-safe doc is always defined.
const dom = doc!;

const MAX_TARGET_VALUE_LENGTH = 128;

/**
 * Simulates DOM clobbering. In a real browser `<form><input name="id"></form>`
 * makes `form.id` return the input element: HTMLFormElement is
 * `[LegacyOverrideBuiltIns]`, so its named getter installs own properties that
 * shadow the `Element.prototype` accessors. jsdom does not implement that
 * shadowing (verified: `form.id` stays a string), so the own property is installed
 * by hand here. The markup that triggers it for real is covered by the e2e fixture
 * in test/e2e/spec/10-interactions.
 */
function clobber(element: Element, property: string, value: unknown): void {
  Object.defineProperty(element, property, { value, configurable: true, writable: true });
}

function emit(element: Element): void {
  emitInteractionEvent({
    type: "click",
    title: "Click test",
    id: "0123456789abcdef",
    name: "test",
    nameSource: "custom_attribute",
    element,
  });
}

describe("interaction event emission", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    // The limiter is module state built on first emit, so without this the
    // budget spent by one test case is missing from the next one.
    resetInteractionRateLimiterForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function lastLog(): LogRecord {
    const calls = (sendLog as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1]![0] as LogRecord;
  }

  function attribute(key: string): unknown {
    return lastLog().attributes?.find((kv) => kv.key === key)?.value;
  }

  describe("interaction.target.id", () => {
    it("emits the id as a string", () => {
      dom.body.innerHTML = `<button id="btn">Save</button>`;
      emit(dom.getElementById("btn")!);

      expect(attribute(INTERACTION_TARGET_ID)).toEqual({ stringValue: "btn" });
    });

    it("omits the attribute entirely when the element has no id", () => {
      dom.body.innerHTML = `<button class="btn">Save</button>`;
      emit(dom.querySelector("button")!);

      expect(lastLog().attributes?.map((kv) => kv.key)).not.toContain(INTERACTION_TARGET_ID);
    });

    it("caps a long id at the same length as the selector", () => {
      // Generated ids and ids carrying encoded state are unbounded in the wild, and
      // this attribute ships on every single interaction.
      const longId = "x".repeat(500);
      dom.body.innerHTML = `<button id="${longId}">Save</button>`;
      emit(dom.getElementById(longId)!);

      expect(attribute(INTERACTION_TARGET_ID)).toEqual({
        stringValue: "x".repeat(MAX_TARGET_VALUE_LENGTH),
      });
    });

    it("caps at exactly the boundary, leaving a MAX_TARGET_VALUE_LENGTH id untouched", () => {
      const exactId = "y".repeat(MAX_TARGET_VALUE_LENGTH);
      dom.body.innerHTML = `<button id="${exactId}">Save</button>`;
      emit(dom.getElementById(exactId)!);

      expect(attribute(INTERACTION_TARGET_ID)).toEqual({ stringValue: exactId });
    });
  });

  describe("DOM-clobbered targets", () => {
    it("reports the real id of a form whose id property is shadowed by a named control", () => {
      dom.body.innerHTML = `<form id="checkout"><input name="id" value="42" /></form>`;
      const form = dom.getElementById("checkout")!;
      clobber(form, "id", form.querySelector("input"));

      emit(form);

      // Without the clobber-safe read this ships as an empty kvlistValue, because
      // toAnyValue falls through to its object branch for an Element.
      expect(attribute(INTERACTION_TARGET_ID)).toEqual({ stringValue: "checkout" });
      expect(attribute(INTERACTION_TARGET_SELECTOR)).toEqual({ stringValue: "form#checkout" });
    });

    it("reports the real tag of a form whose tagName property is shadowed", () => {
      dom.body.innerHTML = `<form id="checkout"><input name="tagName" /></form>`;
      const form = dom.getElementById("checkout")!;
      clobber(form, "tagName", form.querySelector("input"));

      emit(form);

      expect(attribute(INTERACTION_TARGET_TAG)).toEqual({ stringValue: "form" });
      expect(attribute(INTERACTION_TARGET_SELECTOR)).toEqual({ stringValue: "form#checkout" });
    });

    it("derives the class-based selector of a form whose classList is shadowed", () => {
      dom.body.innerHTML = `<form class="checkout-form wide"><input name="classList" /></form>`;
      const form = dom.querySelector("form")!;
      clobber(form, "classList", form.querySelector("input"));

      emit(form);

      expect(attribute(INTERACTION_TARGET_SELECTOR)).toEqual({ stringValue: "form.checkout-form" });
    });

    it("anchors the ancestor walk on a clobbered form's real id", () => {
      dom.body.innerHTML = `
        <form id="checkout" class="form">
          <input name="id" value="42" />
          <div class="row"><span class="cell">Total</span></div>
        </form>`;
      const form = dom.getElementById("checkout")!;
      clobber(form, "id", form.querySelector("input"));

      // The walk must stop at the form because it has an id, and render that id --
      // reading `.id` naively both breaks the anchor rendering and, being truthy,
      // still ends the walk, so only the rendering is visibly wrong.
      expect(buildSelector(dom.querySelector(".cell")!)).toBe("form#checkout > div.row > span.cell");
    });
  });

  describe("rate limiting", () => {
    function sentCount(): number {
      return (sendLog as ReturnType<typeof vi.fn>).mock.calls.length;
    }

    function emitTimes(count: number): void {
      dom.body.innerHTML = `<button id="btn">Save</button>`;
      const button = dom.getElementById("btn")!;
      for (let i = 0; i < count; i++) {
        emit(button);
      }
    }

    it("emits up to the default per-ten-second budget and silently drops the rest", () => {
      // The budget exists so a burst of interactions cannot evict spans, errors
      // and web vitals from the shared transport budget.
      emitTimes(DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS + 20);

      expect(sentCount()).toBe(DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS);
    });

    it("honours a configured budget", () => {
      vars.interactionInstrumentation.maxEventsPerTenSeconds = 4;

      emitTimes(10);

      expect(sentCount()).toBe(4);
    });

    it("clamps a budget above the transport ceiling, so interactions can never exceed it", () => {
      vars.interactionInstrumentation.maxEventsPerTenSeconds = 100_000;

      emitTimes(MAX_TRANSPORT_CALLS_PER_TEN_SECONDS + 5);

      expect(sentCount()).toBe(MAX_TRANSPORT_CALLS_PER_TEN_SECONDS);
    });

    it("clamps a zero budget up to one event instead of falling back to the default", () => {
      // createRateLimiter treats a falsy limit as "unset" and substitutes 32, so
      // 0 has to be clamped before it gets there.
      vars.interactionInstrumentation.maxEventsPerTenSeconds = 0;

      emitTimes(5);

      expect(sentCount()).toBe(1);
    });

    it("falls back to the default when the configured budget is not a usable number", () => {
      vars.interactionInstrumentation.maxEventsPerTenSeconds = NaN;

      emitTimes(DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS + 5);

      expect(sentCount()).toBe(DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS);
    });
  });
});
