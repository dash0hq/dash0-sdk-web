import { doc } from "../../utils";
import { vars } from "../../vars";

const MAX_ANCESTOR_DEPTH = 5;
const MAX_SELECTOR_LENGTH = 250;
const MAX_TEXT_LENGTH = 100;
const MAX_CLASSES_PER_ELEMENT = 2;

/**
 * Attributes an application author controls deliberately, and that therefore survive a refactor
 * better than a generated class name does. Checked in order.
 */
const STABLE_ATTRIBUTES = ["data-testid", "data-test-id", "data-test", "data-cy", "name"];

// Identifiers safe to embed in a selector unescaped. Anything else (framework-generated ids
// containing `:` or `.`, emoji, ...) falls through to the structural path.
const SAFE_IDENTIFIER = /^[A-Za-z_-][\w-]*$/;

// Class names that look generated (CSS modules, styled-components, Tailwind's arbitrary values).
// They differ between builds, so a selector built from them is useless for grouping.
const GENERATED_CLASS = /(^|[_-])[a-z0-9]{5,}$|^css-|^sc-/i;

const TEXTUAL_FALLBACK_ATTRIBUTES = ["aria-label", "title", "alt", "placeholder"];

// Native `option` is left out on purpose: a click on one resolves to its `select`, so the chosen
// value is never reported.
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  '[role~="button"]',
  '[role~="link"]',
  '[role~="menuitem"]',
  '[role~="menuitemcheckbox"]',
  '[role~="menuitemradio"]',
  '[role~="tab"]',
  '[role~="checkbox"]',
  '[role~="radio"]',
  '[role~="switch"]',
  '[role~="option"]',
].join(", ");

// Regions whose text is what the user typed or chose, native or ARIA. `role` is a whitespace-separated
// list, so the roles match as a token, not the whole attribute.
const USER_VALUE_SELECTOR = [
  '[contenteditable]:not([contenteditable="false"])',
  '[role~="textbox"]',
  '[role~="searchbox"]',
  '[role~="combobox"]',
  '[role~="spinbutton"]',
].join(", ");

// Inputs are not listed, their value is never part of the text content.
const SENSITIVE_DESCENDANT_SELECTOR = `textarea, select, ${USER_VALUE_SELECTOR}`;

/**
 * Builds a CSS selector for the clicked element. The selector is a best effort at something a
 * human recognises and a backend can group by — it is not guaranteed to resolve to exactly one
 * element, and it is never used to query the DOM.
 *
 * Walks up at most `MAX_ANCESTOR_DEPTH` ancestors, stopping early at the first id or stable data
 * attribute, which carries more meaning than anything further up the tree.
 */
export function buildCssSelector(target: Element): string {
  const parts: string[] = [];
  let el: Element | null = target;

  // `body` and `html` are on every path and identify nothing, so the walk stops below them.
  for (let depth = 0; el && depth < MAX_ANCESTOR_DEPTH && el !== doc?.body && el !== doc?.documentElement; depth++) {
    const anchor = anchorSelector(el);
    if (anchor) {
      parts.unshift(anchor);
      break;
    }
    parts.unshift(structuralSelector(el));
    el = el.parentElement;
  }

  return truncate(parts.join(">"), MAX_SELECTOR_LENGTH);
}

/**
 * A selector that identifies the element on its own, making the ancestor walk unnecessary.
 */
function anchorSelector(el: Element): string | undefined {
  const id = attr(el, "id");
  if (id && SAFE_IDENTIFIER.test(id)) {
    return "#" + id;
  }

  for (const name of STABLE_ATTRIBUTES) {
    const value = attr(el, name);
    if (value && SAFE_IDENTIFIER.test(value)) {
      return `${tagName(el)}[${name}="${value}"]`;
    }
  }

  return undefined;
}

function structuralSelector(el: Element): string {
  let selector = tagName(el);

  const classes = authoredClassNames(el);
  for (const className of classes) {
    selector += "." + className;
  }

  // Only disambiguate when we have to: a position makes the selector brittle, and it adds
  // nothing when the element is already the only one of its tag among its siblings.
  if (classes.length === 0) {
    const index = nthOfType(el);
    if (index > 0) {
      selector += `:nth-of-type(${index})`;
    }
  }

  return selector;
}

function authoredClassNames(el: Element): string[] {
  const list = el.classList;
  if (!list) return [];

  const result: string[] = [];
  for (let i = 0; i < list.length && result.length < MAX_CLASSES_PER_ELEMENT; i++) {
    const className = list[i]!;
    if (SAFE_IDENTIFIER.test(className) && !GENERATED_CLASS.test(className)) {
      result.push(className);
    }
  }
  return result;
}

function nthOfType(el: Element): number {
  const siblings = el.parentElement?.children;
  if (!siblings) return 0;

  let index = 0;
  let sameTagCount = 0;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i]!;
    if (sibling.tagName === el.tagName) {
      sameTagCount++;
      if (sibling === el) {
        index = sameTagCount;
      }
    }
  }
  return sameTagCount > 1 ? index : 0;
}

/**
 * The element a human would name as the thing they clicked: the nearest interactive ancestor of
 * the target (or the target itself), else the raw target.
 */
export function reportedElement(target: Element): Element {
  return interactiveAncestor(target) ?? target;
}

function interactiveAncestor(target: Element): Element | undefined {
  return target.closest?.(INTERACTIVE_SELECTOR) ?? undefined;
}

/**
 * The visible label of the clicked element, for a human reading the event without opening the
 * replay ("Submit order", not just `button.primary`).
 *
 * Returns undefined whenever the text could carry user data: the element is masked or blocked
 * per the session recording configuration, or it is a field the user types into. Text is what
 * makes a rage click event readable, and also the only part of it that can leak — when in doubt
 * this drops it.
 *
 * The text is read from the nearest interactive element, and a container's concatenated text is
 * never reported. A descendant that is masked, blocked or editable drops the text.
 */
export function extractText(target: Element): string | undefined {
  if (isMaskedOrBlocked(target) || someComposedAncestor(target, (el) => matchesSelector(el, USER_VALUE_SELECTOR))) {
    return undefined;
  }

  const el = interactiveAncestor(target);
  if (!el) {
    // A container's text is its descendants' text, so only a leaf is read.
    return target.firstElementChild ? fallbackText(target, TEXTUAL_FALLBACK_ATTRIBUTES) : labelText(target);
  }

  const tag = tagName(el);

  if (tag === "input") {
    const type = (attr(el, "type") ?? "text").toLowerCase();
    // Only the label of a button-like input is a label. Every other input holds what the user typed.
    if (type !== "button" && type !== "submit" && type !== "reset") {
      return fallbackText(el, ["aria-label", "title", "placeholder"]);
    }
    return truncate(normalizeWhitespace(attr(el, "value") ?? ""), MAX_TEXT_LENGTH) || undefined;
  }

  if (tag === "textarea" || tag === "select") {
    return fallbackText(el, ["aria-label", "title"]);
  }

  return hasSensitiveDescendant(el) ? undefined : labelText(el);
}

function labelText(el: Element): string | undefined {
  const text = truncate(normalizeWhitespace(visibleText(el)), MAX_TEXT_LENGTH);
  return text || fallbackText(el, TEXTUAL_FALLBACK_ATTRIBUTES);
}

// `innerText` is missing on SVG elements and in jsdom.
function visibleText(el: Element): string {
  const inner = (el as HTMLElement).innerText;
  return typeof inner === "string" ? inner : (el.textContent ?? "");
}

function hasSensitiveDescendant(el: Element): boolean {
  const descendants = el.getElementsByTagName("*");
  for (let i = 0; i < descendants.length; i++) {
    const current = descendants[i]!;
    if (isExcludedFromRecording(current) || matchesSelector(current, SENSITIVE_DESCENDANT_SELECTOR)) {
      return true;
    }
  }
  return false;
}

function fallbackText(el: Element, attributes: string[]): string | undefined {
  for (const name of attributes) {
    const value = truncate(normalizeWhitespace(attr(el, name) ?? ""), MAX_TEXT_LENGTH);
    if (value) return value;
  }
  return undefined;
}

/**
 * Whether the element, or any ancestor, is excluded from the session recording. Reuses the
 * recording configuration rather than introducing a second masking surface: a consumer who
 * marked a subtree as sensitive for the replay means it for this event too, whether or not
 * session recording is actually running.
 */
export function isMaskedOrBlocked(el: Element): boolean {
  // Text is read from an ancestor of the target, so every ancestor's mask has to count.
  return someComposedAncestor(el, isExcludedFromRecording);
}

function isExcludedFromRecording(el: Element): boolean {
  const { maskTextClass, maskTextSelector, blockClass, blockSelector } = vars.sessionRecording;
  return (
    matchesClass(el, maskTextClass) ||
    matchesClass(el, blockClass) ||
    matchesSelector(el, maskTextSelector) ||
    matchesSelector(el, blockSelector)
  );
}

// The element or any ancestor, unbounded, continuing into the host at the top of each shadow tree.
function someComposedAncestor(el: Element, predicate: (el: Element) => boolean): boolean {
  for (let current: Element | null = el; current; current = composedParent(current)) {
    if (predicate(current)) return true;
  }
  return false;
}

// `parentElement` is null at the top of a shadow tree, where the walk continues at the host.
function composedParent(el: Element): Element | null {
  return el.parentElement ?? (el.parentNode as ShadowRoot | null)?.host ?? null;
}

function matchesSelector(el: Element, selector: string | undefined): boolean {
  if (!selector || !el.matches) return false;
  try {
    return el.matches(selector);
  } catch (_ignored) {
    // An invalid selector must not take the click handler down with it.
    return false;
  }
}

function matchesClass(el: Element, matcher: string | RegExp | undefined): boolean {
  if (!matcher) return false;

  if (typeof matcher === "string") {
    return el.classList?.contains(matcher) ?? false;
  }
  // Read the attribute, not `className`: SVG elements carry an SVGAnimatedString there.
  return (attr(el, "class") ?? "").split(/\s+/).some((name) => matcher.test(name));
}

function attr(el: Element, name: string): string | undefined {
  return el.getAttribute?.(name) ?? undefined;
}

function tagName(el: Element): string {
  return (el.tagName ?? "").toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
}
