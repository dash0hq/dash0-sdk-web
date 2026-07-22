import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";
import { sendLog } from "../../transport";
import { doc } from "../../utils/globals";
import {
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

import { handleChange } from "./change";
import { clearActiveInteractionForTests, getActiveInteraction } from "./active-interaction";

const dom = doc!;

function changeEventFor(el: Element): Event {
  const event = new Event("change", { bubbles: true });
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

describe("change instrumentation", () => {
  beforeEach(() => {
    dom.body.innerHTML = "";
    vars.interactionInstrumentation = { enabled: true, actionNameAttribute: "data-dash0-action-name" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearActiveInteractionForTests();
    vi.clearAllMocks();
  });

  it("reports only the value LENGTH for text inputs, never the value", () => {
    dom.body.innerHTML = `<input id="email" type="text" aria-label="Email" />`;
    const input = dom.getElementById("email") as HTMLInputElement;
    input.value = "user@example.com"; // 16 characters of user data

    handleChange(changeEventFor(input));

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

    handleChange(changeEventFor(input));

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

    handleChange(changeEventFor(select));

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

    handleChange(changeEventFor(box));

    const log = lastLog();
    expect(log.body).toEqual({ stringValue: 'Toggle "Subscribe" on /' });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toBeUndefined();
  });

  it("ignores change events from non-form elements", () => {
    dom.body.innerHTML = `<div id="d"></div>`;
    handleChange(changeEventFor(dom.getElementById("d")!));

    expect(sendLog).not.toHaveBeenCalled();
  });

  it("registers the change as the active interaction for span attribution", () => {
    dom.body.innerHTML = `<select id="c" aria-label="Country"><option selected>A</option></select>`;
    handleChange(changeEventFor(dom.getElementById("c")!));

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("Country");
  });

  it("names the field via naming attributes and records the source", () => {
    dom.body.innerHTML = `<textarea id="notes" placeholder="Notes"></textarea>`;
    const ta = dom.getElementById("notes") as HTMLTextAreaElement;
    ta.value = "abc";

    handleChange(changeEventFor(ta));

    const log = lastLog();
    expect(attr(log, INTERACTION_NAME)).toEqual({ stringValue: "Notes" });
    expect(attr(log, INTERACTION_NAME_SOURCE)).toEqual({ stringValue: "standard_attribute" });
    expect(attr(log, INTERACTION_VALUE_LENGTH)).toEqual({ doubleValue: 3 });
  });
});
