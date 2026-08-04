import { DEFAULT_ACTION_NAME_ATTRIBUTE, vars } from "../../vars";
import { warn } from "../../utils/debug";
import { elementAttribute, elementTag } from "../../utils/dom";

export type ActionNameSource = "custom_attribute" | "standard_attribute" | "text_content" | "blank";

export type ActionNameResult = {
  name: string;
  nameSource: ActionNameSource;
};

/**
 * Last-chance hook to replace or drop a derived interaction name before it is
 * emitted. See `InteractionInstrumentationSettings.actionNameScrubber`.
 */
export type ActionNameScrubber = (name: string, source: ActionNameSource, target: Element) => string;

const MAX_ANCESTOR_WALK = 10;
const MAX_NAME_LENGTH = 100;
const TRUNCATION_MARKER = " [...]";
const BOUNDARY_TAGS = new Set(["FORM", "BODY", "HTML", "HEAD"]);
const VALUE_READABLE_INPUT_TYPES = new Set(["button", "submit", "reset"]);
// Elements whose visible text is read during the text-content phase because their
// text is an action label rather than page content.
const CLICKABLE_TEXT_TAGS = new Set(["BUTTON", "LABEL", "A"]);
// Never read text from these elements OR their descendants: an OPTION's / SELECT's
// visible text is the user's chosen value, a TEXTAREA's text IS its value, an
// OUTPUT holds a computed result, and SCRIPT/STYLE/NOSCRIPT hold source code
// rather than a label. Crucial for keeping such text out of the label collected
// from ANY element, because a label almost always WRAPS its control. (Controls may
// still be named via attribute sources such as aria-label or placeholder.)
//
// Matched against `localName`, which is lowercase for HTML elements in both HTML
// and XHTML documents; `tagName` is uppercase only in HTML documents, so an
// uppercase set silently never matches in an XHTML document.
const TEXT_EXCLUDED_TAGS = new Set(["input", "textarea", "select", "option", "output", "script", "style", "noscript"]);
// labelText budgets. The name is capped at MAX_NAME_LENGTH anyway, so 1024
// characters leaves ~10x headroom for markup whitespace. The node bound is the
// one that matters for pathological subtrees: characters only accumulate on text
// nodes, so a virtualized grid of empty elements never reaches the char budget.
const MAX_TEXT_SCAN_LENGTH = 1024;
const MAX_TEXT_SCAN_NODES = 1000;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isTextExcluded(el: Element): boolean {
  // `localName` rather than the clobber-safe `elementTag`: FORM is not in the set,
  // so a shadowed `localName` on a form yields the same `false` this returns for a
  // form anyway. See utils/dom for what shadowing is and where it does matter.
  if (TEXT_EXCLUDED_TAGS.has(el.localName)) return true;
  // A contenteditable region holds user-typed content. The attribute is read
  // directly rather than via `isContentEditable`: that property is unimplemented
  // in jsdom and is false for elements outside a rendered document. An empty
  // value means editable per spec; only an explicit "false" opts out.
  const editable = elementAttribute(el, "contenteditable");
  return editable != null && editable.toLowerCase() !== "false";
}

/**
 * Collects the author-written label text of `el`: like `textContent`, but never
 * descends into an element whose text is user data rather than a label (see
 * TEXT_EXCLUDED_TAGS / contenteditable), and returns "" when `el` is itself such
 * an element. `textContent` cannot be used for naming because a label almost
 * always wraps its control -- `<label>Notes <textarea>...</textarea></label>` --
 * so the control's value would end up in the interaction name and, from there, in
 * the log body and on `user_interaction.name` of correlated HTTP spans.
 *
 * Shadow roots are never traversed, matching `textContent`.
 *
 * Bounded by MAX_TEXT_SCAN_LENGTH collected characters and MAX_TEXT_SCAN_NODES
 * visited nodes. Traverses via firstChild/nextSibling rather than childNodes so
 * that a node with 50k children cannot cost 50k pushes before a budget is
 * consulted. The result is whitespace-normalized.
 */
function labelText(el: Element): string {
  let text = "";
  let visited = 0;
  const pending: Node[] = [];
  let node: Node | null = isTextExcluded(el) ? null : el.firstChild;

  while (node && text.length < MAX_TEXT_SCAN_LENGTH && visited < MAX_TEXT_SCAN_NODES) {
    visited++;
    // Queued before descending, which keeps the traversal in document order.
    // Since we start at el.firstChild and only ever queue a visited node's
    // sibling, the walk cannot escape el's subtree.
    if (node.nextSibling) {
      pending.push(node.nextSibling);
    }

    let child: Node | null = null;
    if (node.nodeType === 3) {
      text += (node as Text).data;
    } else if (node.nodeType === 1) {
      if (isTextExcluded(node as Element)) {
        // A separator, so dropping a control cannot glue its neighbours into one
        // word: "Qty<input>units" -> "Qty units", not "Qtyunits".
        text += " ";
      } else {
        child = node.firstChild;
      }
    }

    node = child || pending.pop() || null;
  }

  return normalizeWhitespace(text);
}

function truncate(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) {
    return name;
  }
  return name.substring(0, MAX_NAME_LENGTH) + TRUNCATION_MARKER;
}

function finalize(name: string, nameSource: ActionNameSource): ActionNameResult {
  const normalized = normalizeWhitespace(name);
  if (!normalized) {
    return { name: "", nameSource: "blank" };
  }
  return { name: truncate(normalized), nameSource };
}

/**
 * Collects the click target plus up to MAX_ANCESTOR_WALK ancestor elements,
 * stopping (inclusively) at the first FORM/BODY/HTML/HEAD boundary.
 *
 * The tag is read clobber-safely: FORM is a boundary here, and a form's own named
 * controls can shadow its `tagName` (see utils/dom), which would otherwise make the
 * comparison silently false and let the walk cross the boundary it must stop at.
 */
function collectWalkPath(target: Element): Element[] {
  const path: Element[] = [target];
  let current: Element | null = target;

  if (BOUNDARY_TAGS.has(elementTag(target))) {
    return path;
  }

  for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
    current = current.parentElement;
    if (!current) break;
    path.push(current);
    if (BOUNDARY_TAGS.has(elementTag(current))) break;
  }

  return path;
}

function findCustomAttributeName(path: Element[], actionNameAttribute: string): string | undefined {
  for (const el of path) {
    const value = elementAttribute(el, actionNameAttribute);
    if (value != null && normalizeWhitespace(value)) {
      return value;
    }
  }
  return undefined;
}

function resolveAriaLabelledBy(el: Element): string | undefined {
  const labelledBy = elementAttribute(el, "aria-labelledby");
  if (!labelledBy) return undefined;

  const doc = el.ownerDocument;
  const parts = labelledBy
    .split(/\s+/)
    .map((id) => {
      const ref = doc.getElementById(id);
      // labelText, not textContent: an aria-labelledby target routinely wraps a
      // form control -- or is one -- in which case it contributes nothing.
      return ref ? labelText(ref) : "";
    })
    .filter((text) => text.length > 0);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function readInputValueIfSafe(el: Element): string | undefined {
  if (elementTag(el) !== "INPUT") return undefined;
  const type = (elementAttribute(el, "type") || "text").toLowerCase();
  if (!VALUE_READABLE_INPUT_TYPES.has(type)) return undefined;
  const value = (el as HTMLInputElement).value;
  return value ? value : undefined;
}

/**
 * Attribute-only sources: the value of button/submit/reset inputs, aria-label,
 * aria-labelledby resolution, alt, title, and placeholder. Visible text is
 * deliberately NOT read here — it belongs to the text-content phase.
 */
function findStandardAttributeName(path: Element[]): string | undefined {
  for (const el of path) {
    const inputValue = readInputValueIfSafe(el);
    if (inputValue) return inputValue;

    const ariaLabel = elementAttribute(el, "aria-label");
    if (ariaLabel && normalizeWhitespace(ariaLabel)) return ariaLabel;

    const labelledByText = resolveAriaLabelledBy(el);
    if (labelledByText) return labelledByText;

    const alt = elementAttribute(el, "alt");
    if (alt && normalizeWhitespace(alt)) return alt;

    const title = elementAttribute(el, "title");
    if (title && normalizeWhitespace(title)) return title;

    const placeholder = elementAttribute(el, "placeholder");
    if (placeholder && normalizeWhitespace(placeholder)) return placeholder;
  }
  return undefined;
}

/**
 * Text-content source: the label text of clickable-tag elements
 * (BUTTON/[role=button]/LABEL/A) found along the walk path. A click that lands
 * on a non-interactive container (e.g. a layout <div>/<footer>) with no such
 * element in its path — and no naming attribute — deliberately yields no name,
 * so deriveActionName falls through to "blank" + target metadata rather than
 * dumping the container's entire text.
 *
 * The text is collected with `labelText`, never `textContent`, so a control
 * nested inside the named element (the `<label>Notes <textarea>` shape) never
 * contributes its value. That exclusion is what makes it safe to read an
 * ancestor's text for a click that landed on the control itself.
 */
function findTextContentName(path: Element[]): string | undefined {
  for (const el of path) {
    if (CLICKABLE_TEXT_TAGS.has(elementTag(el)) || elementAttribute(el, "role") === "button") {
      const text = labelText(el);
      if (text) return text;
    }
  }

  return undefined;
}

let scrubberWarned = false;

/**
 * Applies the consumer-configured scrubber, fail-closed: if it throws or returns
 * a non-string the name is dropped entirely rather than emitted unscrubbed --
 * matching how `addUrlAttributes` drops URL attributes when a custom
 * `urlAttributeScrubber` misbehaves. Warns at most once, since a throwing
 * scrubber would otherwise fire on every interaction.
 *
 * Only invoked for a derived, non-empty name: a scrubber must not be able to
 * invent a name where the SDK derived none.
 */
function applyScrubber(result: ActionNameResult, target: Element, scrubber?: ActionNameScrubber): ActionNameResult {
  if (!scrubber || !result.name) {
    return result;
  }

  try {
    const scrubbed = scrubber(result.name, result.nameSource, target);
    if (typeof scrubbed !== "string") {
      if (!scrubberWarned) {
        scrubberWarned = true;
        warn("Dash0 actionNameScrubber did not return a string. Dropping the interaction name.");
      }
      return { name: "", nameSource: "blank" };
    }
    // finalize again so a scrubber cannot bypass normalization or the length cap.
    return finalize(scrubbed, result.nameSource);
  } catch (err) {
    if (!scrubberWarned) {
      scrubberWarned = true;
      warn("Dash0 actionNameScrubber threw. Dropping the interaction name.", err);
    }
    return { name: "", nameSource: "blank" };
  }
}

/**
 * Derives a human-readable interaction name for an interaction target, following
 * Datadog RUM's action-name priority order:
 *   1. configured custom attribute (target or ancestor)
 *   2. standard attribute-based sources (target or ancestor)
 *   3. label text of clickable-tag elements (button/link/label/[role=button])
 *      found along the walk path
 *   4. blank
 *
 * The ancestor walk is capped at 10 levels and stops (inclusively) at the
 * first FORM/BODY/HTML/HEAD boundary.
 *
 * Privacy: never reads the value of password/text/textarea/select elements --
 * only button/submit/reset inputs expose `.value` -- and never reads text from a
 * form control, `<output>`, contenteditable region, or `<script>`/`<style>`
 * anywhere inside the element it names, including via `aria-labelledby` (see
 * `labelText`). Whitespace is always normalized and the result is truncated to
 * 100 characters. Whatever survives is passed through the optional consumer
 * scrubber as the final step.
 */
export function deriveActionName(
  target: Element,
  actionNameAttribute: string,
  scrubber?: ActionNameScrubber
): ActionNameResult {
  const path = collectWalkPath(target);

  const customName = findCustomAttributeName(path, actionNameAttribute);
  if (customName) {
    return applyScrubber(finalize(customName, "custom_attribute"), target, scrubber);
  }

  const standardName = findStandardAttributeName(path);
  if (standardName) {
    return applyScrubber(finalize(standardName, "standard_attribute"), target, scrubber);
  }

  const textName = findTextContentName(path);
  if (textName) {
    return applyScrubber(finalize(textName, "text_content"), target, scrubber);
  }

  return { name: "", nameSource: "blank" };
}

/**
 * The single choke point every interaction type goes through to name its target.
 * Reads the naming configuration from `vars` so that no handler can accidentally
 * bypass the configured scrubber; `deriveActionName` stays pure and takes its
 * configuration explicitly so it remains directly unit-testable.
 */
export function resolveActionName(target: Element): ActionNameResult {
  const settings = vars.interactionInstrumentation;
  return deriveActionName(
    target,
    settings.actionNameAttribute ?? DEFAULT_ACTION_NAME_ATTRIBUTE,
    settings.actionNameScrubber
  );
}
