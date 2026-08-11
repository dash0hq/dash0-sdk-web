import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { vars } from "../../vars";
import { deriveActionName, resolveActionName } from "./action-name";

// Vitest runs these tests in jsdom, so the SSR-safe doc is always defined.
const dom = doc!;
const defaultInteractionSettings = { ...vars.interactionInstrumentation };

describe("interaction semantic conventions", () => {
  it("defines the browser.interaction event name", () => {
    expect(EVENT_NAMES.INTERACTION).toBe("browser.interaction");
  });

  it("defines namespaced interaction attribute keys (log attributes, not body keys)", () => {
    expect(INTERACTION_TYPE).toBe("interaction.type");
    expect(INTERACTION_NAME).toBe("interaction.name");
    expect(INTERACTION_NAME_SOURCE).toBe("interaction.name_source");
    expect(INTERACTION_TARGET_SELECTOR).toBe("interaction.target.selector");
    expect(INTERACTION_TARGET_TAG).toBe("interaction.target.tag");
    expect(INTERACTION_TARGET_ID).toBe("interaction.target.id");
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
    it("uses whitespace-normalized textContent of a clickable-tag element", () => {
      dom.body.innerHTML = `<button id="btn">  Save\n\n  Part   Now  </button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save Part Now",
        nameSource: "text_content",
      });
    });

    it("does NOT harvest textContent from a non-interactive container", () => {
      // Regression guard: a click on a layout <div> with no clickable-tag
      // ancestor and no naming attribute must fall through to blank, not dump
      // the container's entire visible text as the action name.
      dom.body.innerHTML = `<div id="div">  Some\n\n  Text   Here  </div>`;
      const target = dom.getElementById("div")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
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

    it("never derives a name from an OPTION click target's visible text", () => {
      // Pins the OPTION entry of TEXT_FALLBACK_EXCLUDED_TAGS: an option's
      // visible text is the user's chosen value, so a direct click on it
      // (no attribute sources anywhere in the walk) must stay blank.
      dom.body.innerHTML = `
        <select id="sel">
          <option id="opt" value="secret-option" selected>Secret Option Label</option>
        </select>`;
      const target = dom.getElementById("opt")!;

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

    it("does not walk past a FORM whose tagName property is clobbered", () => {
      // In a real browser `<input name="tagName">` shadows `form.tagName` into an
      // element, so a naive `BOUNDARY_TAGS.has(form.tagName)` is silently false and
      // the walk escapes the boundary it exists to enforce. jsdom does not
      // implement the shadowing, so it is installed by hand -- see utils/dom.
      dom.body.innerHTML = `
        <div data-dash0-action-name="Outer Name">
          <form>
            <input name="tagName" />
            <span id="span"></span>
          </form>
        </div>`;
      const form = dom.querySelector("form")!;
      Object.defineProperty(form, "tagName", { value: form.querySelector("input"), configurable: true });

      expect(deriveActionName(dom.getElementById("span")!, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("still reads attributes off a FORM whose getAttribute method is clobbered", () => {
      // `<input name="getAttribute">` shadows the method itself, so calling
      // `form.getAttribute(...)` throws -- and the throw is swallowed by the
      // handler's try/catch, silently dropping the whole interaction.
      dom.body.innerHTML = `
        <form data-dash0-action-name="Checkout Form">
          <input name="getAttribute" />
          <span id="span"></span>
        </form>`;
      const form = dom.querySelector("form")!;
      Object.defineProperty(form, "getAttribute", { value: form.querySelector("input"), configurable: true });

      expect(deriveActionName(dom.getElementById("span")!, attributeName)).toEqual({
        name: "Checkout Form",
        nameSource: "custom_attribute",
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

    it("finds a custom attribute on exactly the 10th ancestor", () => {
      // Pins the exact MAX_ANCESTOR_WALK boundary: the attribute div plus 9
      // plain divs puts the attribute exactly 10 ancestors above the target.
      let html = `<div data-dash0-action-name="At The Cap">`;
      for (let i = 0; i < 9; i++) {
        html += `<div>`;
      }
      html += `<span id="span"></span>`;
      for (let i = 0; i < 9; i++) {
        html += `</div>`;
      }
      html += `</div>`;
      dom.body.innerHTML = html;
      const target = dom.getElementById("span")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "At The Cap",
        nameSource: "custom_attribute",
      });
    });

    it("does not find a custom attribute on the 11th ancestor", () => {
      // Pins the exact MAX_ANCESTOR_WALK boundary from the other side: 10
      // plain divs push the attribute to ancestor 11, one past the cap. The
      // target is deliberately text-free so blank isolates the cap itself.
      let html = `<div data-dash0-action-name="One Past The Cap">`;
      for (let i = 0; i < 10; i++) {
        html += `<div>`;
      }
      html += `<span id="span"></span>`;
      for (let i = 0; i < 10; i++) {
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

  // Regression coverage for the P1 leak: the exclusion list used to be checked
  // against the CLICK TARGET's tag only, while the text itself was read with
  // `Element.textContent` from an ANCESTOR -- and `textContent` concatenates the
  // whole subtree, including the wrapped control's value. A <label> wrapping its
  // control is the dominant form markup, so this was the default shape.
  describe("privacy: text is never harvested from a nested control or editable region", () => {
    it("does not read a wrapped textarea's value from the enclosing label's text", () => {
      dom.body.innerHTML = `<label id="lbl">Notes <textarea>MY PRIVATE SAVED NOTE</textarea></label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Notes",
        nameSource: "text_content",
      });
    });

    it("does not read a wrapped select's option text from the enclosing button's text", () => {
      dom.body.innerHTML = `<button id="btn">Filter <select><option>Acme Corp Invoice 4471</option></select></button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Filter",
        nameSource: "text_content",
      });
    });

    it("names a control click from its enclosing label, without the control's own value", () => {
      // The text phase now applies to form-control targets too: with the
      // control's text excluded from collection, the enclosing label's text is
      // the correct name and carries no user data.
      dom.body.innerHTML = `<label id="lbl">Notes <textarea id="ta">MY PRIVATE SAVED NOTE</textarea></label>`;
      const target = dom.getElementById("ta")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Notes",
        nameSource: "text_content",
      });
    });

    it("excludes a control nested more than one level deep", () => {
      dom.body.innerHTML = `<a id="lnk" href="#"><span><textarea>SECRET</textarea></span> Open</a>`;
      const target = dom.getElementById("lnk")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Open",
        nameSource: "text_content",
      });
    });

    it("separates the text around a removed control instead of gluing it together", () => {
      dom.body.innerHTML = `<label id="lbl">Qty<input value="99" />units</label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Qty units",
        nameSource: "text_content",
      });
    });

    it("does not read an output element's computed value", () => {
      dom.body.innerHTML = `<label id="lbl">Total <output>4,271.33</output></label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Total",
        nameSource: "text_content",
      });
    });

    it("does not read a contenteditable region's text", () => {
      dom.body.innerHTML = `<div id="btn" role="button">Post <div contenteditable="true">USER TYPED DRAFT</div></div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Post",
        nameSource: "text_content",
      });
    });

    it("skips a whole contenteditable region including a nested contenteditable=false chip", () => {
      // Conservative on purpose: a `false` chip inside an editor is typically an
      // app-inserted mention widget holding user data ("Jane Doe").
      dom.body.innerHTML = `
        <div id="btn" role="button">Post
          <div contenteditable="true">Hi <span contenteditable="false">Jane Doe</span></div>
        </div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Post",
        nameSource: "text_content",
      });
    });

    it("treats an empty contenteditable attribute as editable", () => {
      dom.body.innerHTML = `<button id="btn">Comment <span contenteditable="">USER TYPED DRAFT</span></button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Comment",
        nameSource: "text_content",
      });
    });

    it("still reads the text of an element explicitly marked contenteditable=false", () => {
      dom.body.innerHTML = `<label id="lbl" contenteditable="false">Notes</label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Notes",
        nameSource: "text_content",
      });
    });

    it("does not read datalist option text", () => {
      dom.body.innerHTML = `
        <label id="lbl">Search
          <datalist id="dl"><option>ACME Invoice 992</option></datalist>
          <input list="dl" />
        </label>`;
      const target = dom.getElementById("lbl")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Search",
        nameSource: "text_content",
      });
    });

    it("does not read inline script source", () => {
      dom.body.innerHTML = `<button id="btn">Save<script>var token = "tok_live_abc";</script></button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save",
        nameSource: "text_content",
      });
    });

    it("does not read inline style rules", () => {
      dom.body.innerHTML = `<button id="btn">Save<style>.x{color:red}</style></button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save",
        nameSource: "text_content",
      });
    });

    it("does not cross a shadow boundary", () => {
      // Documents a boundary the SDK deliberately does not cross: traversing
      // into shadow roots would open a new leak surface, not close one.
      dom.body.innerHTML = `<div id="host" role="button">Publish</div>`;
      const target = dom.getElementById("host")!;
      target.attachShadow({ mode: "open" }).innerHTML = `<textarea>SECRET DRAFT</textarea>`;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Publish",
        nameSource: "text_content",
      });
    });
  });

  describe("privacy: aria-labelledby resolution", () => {
    it("does not read a control nested inside the referenced element", () => {
      // The worse half of the P1 leak: this path had no exclusion at all, and
      // reported `standard_attribute`, so consumers filtering out text-derived
      // names were still exposed.
      dom.body.innerHTML = `
        <span id="lbl">Upload <textarea>SECRET DRAFT</textarea></span>
        <button id="btn" aria-labelledby="lbl">&uarr;</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Upload",
        nameSource: "standard_attribute",
      });
    });

    it("ignores a reference to an element that is itself a form control, falling through to title", () => {
      dom.body.innerHTML = `
        <textarea id="lbl">SECRET DRAFT</textarea>
        <button id="btn" aria-labelledby="lbl" title="Send">x</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Send",
        nameSource: "standard_attribute",
      });
    });

    it("falls through to blank when aria-labelledby only references a form control", () => {
      dom.body.innerHTML = `
        <textarea id="lbl">SECRET DRAFT</textarea>
        <div id="btn" aria-labelledby="lbl"></div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });
  });

  describe("text scan budget", () => {
    it("stops the walk at MAX_TEXT_SCAN_NODES rather than scanning an unbounded subtree", () => {
      // Characters only accumulate on text nodes, so a subtree of empty
      // elements would never hit the character budget -- the node bound is what
      // keeps a click inside a virtualized grid cheap.
      dom.body.innerHTML = `<div id="btn" role="button">${"<span></span>".repeat(1200)}Save</div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("still reaches label text just inside the node budget", () => {
      dom.body.innerHTML = `<div id="btn" role="button">${"<span></span>".repeat(900)}Save</div>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName)).toEqual({
        name: "Save",
        nameSource: "text_content",
      });
    });

    it("still normalizes and truncates when the character budget is exhausted", () => {
      dom.body.innerHTML = `<button id="btn">${"<span>word </span>".repeat(300)}</button>`;
      const target = dom.getElementById("btn")!;

      const result = deriveActionName(target, attributeName);
      expect(result.nameSource).toBe("text_content");
      expect(result.name).toBe("word ".repeat(20) + " [...]");
    });
  });

  describe("actionNameScrubber", () => {
    it("replaces the derived name", () => {
      dom.body.innerHTML = `<button id="btn">Delete jane@acme.com</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName, () => "Delete User")).toEqual({
        name: "Delete User",
        nameSource: "text_content",
      });
    });

    it("receives the derived name, its source and the interaction target", () => {
      dom.body.innerHTML = `<button id="btn" aria-label="Close Dialog">x</button>`;
      const target = dom.getElementById("btn")!;
      const scrubber = vi.fn(() => "scrubbed");

      deriveActionName(target, attributeName, scrubber);

      expect(scrubber).toHaveBeenCalledTimes(1);
      expect(scrubber).toHaveBeenCalledWith("Close Dialog", "standard_attribute", target);
    });

    it("is not called when no name was derived, so it cannot invent one", () => {
      dom.body.innerHTML = `<div id="div"></div>`;
      const target = dom.getElementById("div")!;
      const scrubber = vi.fn(() => "invented");

      expect(deriveActionName(target, attributeName, scrubber)).toEqual({
        name: "",
        nameSource: "blank",
      });
      expect(scrubber).not.toHaveBeenCalled();
    });

    it("drops the name when the scrubber returns an empty string", () => {
      dom.body.innerHTML = `<button id="btn">Delete</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName, () => "")).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("fails closed when the scrubber throws: drops the name, does not propagate", () => {
      dom.body.innerHTML = `<button id="btn">Delete jane@acme.com</button>`;
      const target = dom.getElementById("btn")!;
      const scrubber = () => {
        throw new Error("boom");
      };

      expect(() => deriveActionName(target, attributeName, scrubber)).not.toThrow();
      expect(deriveActionName(target, attributeName, scrubber)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("fails closed when the scrubber returns a non-string", () => {
      dom.body.innerHTML = `<button id="btn">Delete jane@acme.com</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName, () => undefined as unknown as string)).toEqual({
        name: "",
        nameSource: "blank",
      });
    });

    it("normalizes and truncates the scrubber's return value", () => {
      dom.body.innerHTML = `<button id="btn">Save</button>`;
      const target = dom.getElementById("btn")!;

      const result = deriveActionName(target, attributeName, () => `  ${"C".repeat(150)}  `);
      expect(result.name).toBe("C".repeat(100) + " [...]");
    });

    it("also applies to a name that came from the custom attribute", () => {
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Save jane@acme.com">Save</button>`;
      const target = dom.getElementById("btn")!;

      expect(deriveActionName(target, attributeName, (name) => name.replace(/\S+@\S+/, "[email]"))).toEqual({
        name: "Save [email]",
        nameSource: "custom_attribute",
      });
    });
  });

  describe("resolveActionName (the configuration choke point)", () => {
    afterEach(() => {
      vars.interactionInstrumentation = { ...defaultInteractionSettings };
    });

    it("reads the configured action name attribute", () => {
      vars.interactionInstrumentation = { ...defaultInteractionSettings, actionNameAttribute: "data-track-name" };
      dom.body.innerHTML = `<button id="btn" data-track-name="Custom Attr">Save</button>`;

      expect(resolveActionName(dom.getElementById("btn")!)).toEqual({
        name: "Custom Attr",
        nameSource: "custom_attribute",
      });
    });

    it("falls back to the default attribute when the option is explicitly undefined", () => {
      // merge() in init.ts spreads source over destination, so a consumer
      // passing `{ actionNameAttribute: undefined }` overwrites the default.
      vars.interactionInstrumentation = { ...defaultInteractionSettings, actionNameAttribute: undefined };
      dom.body.innerHTML = `<button id="btn" data-dash0-action-name="Save Settings">Save</button>`;

      expect(resolveActionName(dom.getElementById("btn")!)).toEqual({
        name: "Save Settings",
        nameSource: "custom_attribute",
      });
    });

    it("applies the configured scrubber, so no interaction type can bypass it", () => {
      vars.interactionInstrumentation = {
        ...defaultInteractionSettings,
        actionNameScrubber: (name) => name.replace(/\S+@\S+/, "[email]"),
      };
      dom.body.innerHTML = `<button id="btn">Delete jane@acme.com</button>`;

      expect(resolveActionName(dom.getElementById("btn")!)).toEqual({
        name: "Delete [email]",
        nameSource: "text_content",
      });
    });
  });
});
