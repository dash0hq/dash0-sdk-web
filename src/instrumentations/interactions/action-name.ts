export type ActionNameSource = "custom_attribute" | "standard_attribute" | "text_content" | "blank";

export type ActionNameResult = {
  name: string;
  nameSource: ActionNameSource;
};

const MAX_ANCESTOR_WALK = 10;
const MAX_NAME_LENGTH = 100;
const TRUNCATION_MARKER = " [...]";
const BOUNDARY_TAGS = new Set(["FORM", "BODY", "HTML", "HEAD"]);
const VALUE_READABLE_INPUT_TYPES = new Set(["button", "submit", "reset"]);
// Elements whose visible text is read during the text-content phase because their
// text is an action label rather than page content.
const CLICKABLE_TEXT_TAGS = new Set(["BUTTON", "LABEL", "A"]);
// Never derive a name from the text content of these click targets: an OPTION's /
// SELECT's visible text is the user's chosen value and a TEXTAREA's text IS its
// value — all user data, not an action label. (They may still be named via
// attribute sources such as aria-label or placeholder.)
const TEXT_FALLBACK_EXCLUDED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
 */
function collectWalkPath(target: Element): Element[] {
  const path: Element[] = [target];
  let current: Element | null = target;

  if (BOUNDARY_TAGS.has(target.tagName)) {
    return path;
  }

  for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
    current = current.parentElement;
    if (!current) break;
    path.push(current);
    if (BOUNDARY_TAGS.has(current.tagName)) break;
  }

  return path;
}

function findCustomAttributeName(path: Element[], actionNameAttribute: string): string | undefined {
  for (const el of path) {
    const value = el.getAttribute(actionNameAttribute);
    if (value != null && normalizeWhitespace(value)) {
      return value;
    }
  }
  return undefined;
}

function resolveAriaLabelledBy(el: Element): string | undefined {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (!labelledBy) return undefined;

  const doc = el.ownerDocument;
  const parts = labelledBy
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent ?? "")
    .map((text) => normalizeWhitespace(text))
    .filter((text) => text.length > 0);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function readInputValueIfSafe(el: Element): string | undefined {
  if (el.tagName !== "INPUT") return undefined;
  const type = (el.getAttribute("type") || "text").toLowerCase();
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

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && normalizeWhitespace(ariaLabel)) return ariaLabel;

    const labelledByText = resolveAriaLabelledBy(el);
    if (labelledByText) return labelledByText;

    const alt = el.getAttribute("alt");
    if (alt && normalizeWhitespace(alt)) return alt;

    const title = el.getAttribute("title");
    if (title && normalizeWhitespace(title)) return title;

    const placeholder = el.getAttribute("placeholder");
    if (placeholder && normalizeWhitespace(placeholder)) return placeholder;
  }
  return undefined;
}

/**
 * Text-content source: the visible text of clickable-tag elements
 * (BUTTON/[role=button]/LABEL/A) found along the walk path. A click that lands
 * on a non-interactive container (e.g. a layout <div>/<footer>) with no such
 * element in its path — and no naming attribute — deliberately yields no name,
 * so deriveActionName falls through to "blank" + target metadata rather than
 * dumping the container's entire textContent. Skipped entirely for
 * INPUT/TEXTAREA/SELECT/OPTION targets — their text content is user data
 * (see TEXT_FALLBACK_EXCLUDED_TAGS).
 */
function findTextContentName(target: Element, path: Element[]): string | undefined {
  if (TEXT_FALLBACK_EXCLUDED_TAGS.has(target.tagName)) return undefined;

  for (const el of path) {
    if (CLICKABLE_TEXT_TAGS.has(el.tagName) || el.getAttribute("role") === "button") {
      const text = el.textContent;
      if (text && normalizeWhitespace(text)) return text;
    }
  }

  return undefined;
}

/**
 * Derives a human-readable interaction name for a clicked element, following
 * Datadog RUM's action-name priority order:
 *   1. configured custom attribute (target or ancestor)
 *   2. standard attribute-based sources (target or ancestor)
 *   3. visible text of clickable-tag elements (button/link/label/[role=button])
 *      found along the walk path
 *   4. blank
 *
 * The ancestor walk is capped at 10 levels and stops (inclusively) at the
 * first FORM/BODY/HTML/HEAD boundary.
 *
 * Privacy: never reads the value of password/text/textarea/select elements --
 * only button/submit/reset inputs expose `.value` -- and never derives a name
 * from the text content of INPUT/TEXTAREA/SELECT/OPTION targets. Whitespace is
 * always normalized and the result is truncated to 100 characters.
 */
export function deriveActionName(target: Element, actionNameAttribute: string): ActionNameResult {
  const path = collectWalkPath(target);

  const customName = findCustomAttributeName(path, actionNameAttribute);
  if (customName) {
    return finalize(customName, "custom_attribute");
  }

  const standardName = findStandardAttributeName(path);
  if (standardName) {
    return finalize(standardName, "standard_attribute");
  }

  const textName = findTextContentName(target, path);
  if (textName) {
    return finalize(textName, "text_content");
  }

  return { name: "", nameSource: "blank" };
}
