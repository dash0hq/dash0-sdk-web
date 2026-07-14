import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc } from "../../utils/globals";
import { INTERACTION_KEY, INTERACTION_TYPE } from "../../semantic-conventions";
import type { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { handleKeydown } from "./keypress";
import { clearActiveInteractionForTests, getActiveInteraction } from "./active-interaction";

const dom = doc!;

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
    clearActiveInteractionForTests();
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

  it("registers the key press as the active interaction for span attribution", () => {
    dom.body.innerHTML = `<input id="q" aria-label="Search parts" />`;

    handleKeydown(keydownOn(dom.getElementById("q")!, "Enter"));

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("Search parts");
  });
});
