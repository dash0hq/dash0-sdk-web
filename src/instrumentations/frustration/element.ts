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
 * The visible label of the clicked element, for a human reading the event without opening the
 * replay ("Submit order", not just `button.primary`).
 *
 * Returns undefined whenever the text could carry user data: the element is masked or blocked
 * per the session recording configuration, or it is a field the user types into. Text is what
 * makes a rage click event readable, and also the only part of it that can leak — when in doubt
 * this drops it.
 */
export function extractText(target: Element): string | undefined {
  if (isMaskedOrBlocked(target)) {
    return undefined;
  }

  const tag = tagName(target);

  if (tag === "input") {
    const type = (attr(target, "type") ?? "text").toLowerCase();
    // Only the label of a button-like input is a label. Every other input holds what the user typed.
    if (type !== "button" && type !== "submit" && type !== "reset") {
      return fallbackText(target, ["aria-label", "title", "placeholder"]);
    }
    return truncate(normalizeWhitespace(attr(target, "value") ?? ""), MAX_TEXT_LENGTH) || undefined;
  }

  if (tag === "textarea" || tag === "select") {
    return fallbackText(target, ["aria-label", "title"]);
  }

  const text = truncate(normalizeWhitespace(target.textContent ?? ""), MAX_TEXT_LENGTH);
  return text || fallbackText(target, TEXTUAL_FALLBACK_ATTRIBUTES);
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
  const { maskTextClass, maskTextSelector, blockClass, blockSelector } = vars.sessionRecording;

  if (matchesSelector(el, maskTextSelector) || matchesSelector(el, blockSelector)) {
    return true;
  }

  for (let current: Element | null = el, depth = 0; current && depth < 32; current = current.parentElement, depth++) {
    if (matchesClass(current, maskTextClass) || matchesClass(current, blockClass)) {
      return true;
    }
  }

  return false;
}

function matchesSelector(el: Element, selector: string | undefined): boolean {
  if (!selector || !el.closest) return false;
  try {
    return el.closest(selector) != null;
  } catch (_ignored) {
    // An invalid selector must not take the click handler down with it.
    return false;
  }
}

function matchesClass(el: Element, matcher: string | RegExp | undefined): boolean {
  if (!matcher) return false;

  const className = el.className;
  if (typeof className !== "string") return false; // SVG elements carry an SVGAnimatedString

  if (typeof matcher === "string") {
    return el.classList?.contains(matcher) ?? false;
  }
  return className.split(/\s+/).some((name) => matcher.test(name));
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
