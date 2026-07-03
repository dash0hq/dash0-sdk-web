import { beforeEach, describe, expect, it } from "vitest";
import {
  EVENT_NAMES,
  INTERACTION_TYPE,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TARGET_ID,
} from "../../semantic-conventions";
import { doc } from "../../utils/globals";
import { deriveActionName } from "./action-name";

// Vitest runs these tests in jsdom, so the SSR-safe doc is always defined.
const dom = doc!;

describe("interaction semantic conventions", () => {
  it("defines the browser.interaction event name", () => {
    expect(EVENT_NAMES.INTERACTION).toBe("browser.interaction");
  });

  it("defines interaction attribute keys", () => {
    expect(INTERACTION_TYPE).toBe("type");
    expect(INTERACTION_NAME).toBe("name");
    expect(INTERACTION_NAME_SOURCE).toBe("name_source");
    expect(INTERACTION_TARGET_SELECTOR).toBe("target.selector");
    expect(INTERACTION_TARGET_TAG).toBe("target.tag");
    expect(INTERACTION_TARGET_ID).toBe("target.id");
  });
});

describe("deriveActionName", () => {
  const attributeName = "data-dash0-action-name";

  beforeEach(() => {
    dom.body.innerHTML = "";
  });

  describe("priority 1: custom attribute", () => {
    it("uses the custom attribute on the target itself", () => {
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Save Settings">Save</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save Settings",
        nameSource: "custom_attribute",
      });
    });

    it("uses the custom attribute on an ancestor", () => {
      dom.body.innerHTML = `
        <div data-dash0-action-name="Card Action">
          <span id="inner">Click me</span>
        </div>`;
      const target = dom.getElementById("inner")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Card Action",
        nameSource: "custom_attribute",
      });
    });

    it("prefers the custom attribute over standard attributes when both are present", () => {
      dom.body.innerHTML = `<button id="btn" aria-label="Aria Label" data-dash0-action-name="Custom Name">Text</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Custom Name",
        nameSource: "custom_attribute",
      });
    });

    it("respects a custom actionNameAttribute name", () => {
      dom.body.innerHTML = `<button id="btn" data-my-name="Custom">Text</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, "data-my-name")).toEqual({
        name: "Custom",
        nameSource: "custom_attribute",
      });
    });
  });

  describe("priority 2: standard attributes", () => {
    it("uses .value for an input[type=button]", () => {
      dom.body.innerHTML = `<input id="inp" type="button" value="Click Here" />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Click Here",
        nameSource: "standard_attribute",
      });
    });

    it("uses .value for an input[type=submit]", () => {
      dom.body.innerHTML = `<input id="inp" type="submit" value="Submit Form" />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Submit Form",
        nameSource: "standard_attribute",
      });
    });

    it("uses .value for an input[type=reset]", () => {
      dom.body.innerHTML = `<input id="inp" type="reset" value="Reset Form" />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Reset Form",
        nameSource: "standard_attribute",
      });
    });

    it("never reads .value for an input[type=text]", () => {
      dom.body.innerHTML = `<input id="inp" type="text" value="secret-input-value" />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("never reads .value for an input[type=password]", () => {
      dom.body.innerHTML = `<input id="inp" type="password" value="hunter2" />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("uses aria-label on a button before visible text", () => {
      dom.body.innerHTML = `<button id="btn" aria-label="Close Dialog">X</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Close Dialog",
        nameSource: "standard_attribute",
      });
    });

    it("uses visible text on a button when aria-label is absent", () => {
      dom.body.innerHTML = `<button id="btn">Save Settings</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save Settings",
        nameSource: "text_content",
      });
    });

    it("uses aria-label on a role=button element", () => {
      dom.body.innerHTML = `<div id="btn" role="button" aria-label="Icon Button"></div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Icon Button",
        nameSource: "standard_attribute",
      });
    });

    it("uses aria-label on a label element", () => {
      dom.body.innerHTML = `<label id="lbl" aria-label="Field Label">Text</label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Field Label",
        nameSource: "standard_attribute",
      });
    });

    it("uses aria-label on an anchor element", () => {
      dom.body.innerHTML = `<a id="lnk" href="#" aria-label="Learn More">Read</a>`;
      const target = dom.getElementById("lnk")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Learn More",
        nameSource: "standard_attribute",
      });
    });

    it("resolves aria-labelledby to referenced element text, joined with a space", () => {
      dom.body.innerHTML = `
        <span id="label-a">Confirm</span>
        <span id="label-b">Purchase</span>
        <button id="btn" aria-labelledby="label-a label-b">X</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Confirm Purchase",
        nameSource: "standard_attribute",
      });
    });

    it("falls back to alt attribute", () => {
      dom.body.innerHTML = `<img id="img" alt="Company Logo" />`;
      const target = dom.getElementById("img")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Company Logo",
        nameSource: "standard_attribute",
      });
    });

    it("falls back to title attribute", () => {
      dom.body.innerHTML = `<span id="span" title="Tooltip Text"></span>`;
      const target = dom.getElementById("span")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Tooltip Text",
        nameSource: "standard_attribute",
      });
    });

    it("falls back to placeholder attribute", () => {
      dom.body.innerHTML = `<input id="inp" type="text" placeholder="Search..." />`;
      const target = dom.getElementById("inp")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Search...",
        nameSource: "standard_attribute",
      });
    });

    it("finds standard attributes on an ancestor when the target has none", () => {
      dom.body.innerHTML = `
        <button id="btn" aria-label="Delete Item">
          <span id="icon">🗑</span>
        </button>`;
      const target = dom.getElementById("icon")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Delete Item",
        nameSource: "standard_attribute",
      });
    });
  });

  describe("priority 3: text content fallback", () => {
    it("uses whitespace-normalized textContent when no attributes match", () => {
      dom.body.innerHTML = `<div id="div">  Some\n\n  Text   Here  </div>`;
      const target = dom.getElementById("div")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Some Text Here",
        nameSource: "text_content",
      });
    });
  });

  describe("priority 4: blank fallback", () => {
    it("returns blank when nothing matches", () => {
      dom.body.innerHTML = `<div id="div"></div>`;
      const target = dom.getElementById("div")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });
  });

  describe("privacy: select and textarea values are never read", () => {
    it("never reads a select's value or selected option text via .value", () => {
      dom.body.innerHTML = `
        <select id="sel">
          <option value="secret-option" selected>Secret Option Label</option>
        </select>`;
      const target = dom.getElementById("sel")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("never reads a textarea's value", () => {
      dom.body.innerHTML = `<textarea id="ta">secret multiline content</textarea>`;
      const target = dom.getElementById("ta")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });
  });

  describe("ancestor walk boundaries", () => {
    it("stops walking at a FORM boundary and does not use attributes above it", () => {
      dom.body.innerHTML = `
        <form data-dash0-action-name="Form Name">
          <span id="span">Inner</span>
        </form>`;
      const target = dom.getElementById("span")!;

      // FORM itself is a valid boundary to check per Datadog prior art (closest() would match it),
      // so the custom attribute on the FORM is still found -- the walk stops AT the boundary, not before it.
      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Form Name",
        nameSource: "custom_attribute",
      });
    });

    it("does not walk past FORM to reach an ancestor's attribute", () => {
      // The target is deliberately text-free so the blank assertion isolates
      // the FORM walk boundary (the target's own text would otherwise
      // legitimately resolve as text_content).
      dom.body.innerHTML = `
        <div data-dash0-action-name="Outer Name">
          <form>
            <span id="span"></span>
          </form>
        </div>`;
      const target = dom.getElementById("span")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("caps the ancestor walk at 10 levels", () => {
      // Build 12 nested divs; only the outermost (12 levels up) carries the attribute,
      // which exceeds the 10-ancestor cap and must not be found.
      // The target is deliberately text-free so the blank assertion isolates
      // the 10-level walk cap (the target's own text would otherwise
      // legitimately resolve as text_content).
      let html = `<div data-dash0-action-name="Too Far">`;
      for (let i = 0; i < 12; i++) {
        html += `<div>`;
      }
      html += `<span id="span"></span>`;
      for (let i = 0; i < 12; i++) {
        html += `</div>`;
      }
      html += `</div>`;
      dom.body.innerHTML = html;
      const target = dom.getElementById("span")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });
  });

  describe("truncation", () => {
    it("truncates names longer than 100 characters and appends a marker", () => {
      const longText = "A".repeat(150);
      dom.body.innerHTML = `<button id="btn">${longText}</button>`;
      const target = dom.getElementById("btn")!;

      const result = deriveActionName(target, attributeName);
      expect(result.nameSource).toBe("text_content");
      expect(result.name).toBe("A".repeat(100) + " [...]");
      expect(result.name.length).toBe(106);
    });

    it("does not truncate names at exactly 100 characters", () => {
      const exactText = "B".repeat(100);
      dom.body.innerHTML = `<button id="btn">${exactText}</button>`;
      const target = dom.getElementById("btn")!;

      const result = deriveActionName(target, attributeName);
      expect(result.name).toBe(exactText);
    });
  });
});
