import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc } from "../../utils/globals";
import { INTERACTION_DIRECTION, INTERACTION_TYPE } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { handleScroll, flushScrollBurstForTests, stopScrollInstrumentationForTests } from "./scroll";

const dom = doc!;

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
});
