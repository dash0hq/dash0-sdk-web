import { nowNanos } from "../../utils";
import { sendLog } from "../../transport";
import {
  EVENT_NAME,
  EVENT_NAMES,
  INTERACTION_ID,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_ID,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TYPE,
  LOG_SEVERITIES,
  PAGE_URL_ATTR_PREFIX,
  URL_PATH,
} from "../../semantic-conventions";
import { addAttribute, findLastAttribute, withPrefix } from "../../utils/otel";
import { addCommonAttributes } from "../../attributes";
import { KeyValue, LogRecord } from "../../types/otlp";

const MAX_SELECTOR_LENGTH = 128;
const MAX_SELECTOR_ANCESTORS = 3;
const SELECTOR_BOUNDARY_TAGS = new Set(["BODY", "HTML"]);

/** The attribute key `addCommonAttributes` emits the scrubbed page path under. */
const PAGE_URL_PATH = withPrefix(PAGE_URL_ATTR_PREFIX)(URL_PATH);

export type InteractionType = "click" | "scroll" | "key_press" | "change";

export type InteractionEvent = {
  /** Discriminator emitted as `interaction.type`. */
  type: InteractionType;
  /**
   * Human-readable one-line summary *without* the page path; becomes the log
   * body once `emitInteractionEvent` has appended ` on <path>`, using the
   * scrubbed `page.url.path` rather than a raw `location.pathname` read.
   */
  title: string;
  /** Correlation id (shared with `user_interaction.id` on attributed spans). */
  id: string;
  /** Derived action name; may be blank. */
  name: string;
  /** How the name was derived. */
  nameSource: string;
  /** The DOM element the interaction targeted. */
  element: Element;
  /** Type-specific extra attributes (e.g. key, direction, value_length). */
  extraAttributes?: KeyValue[];
};

/**
 * Shared emit path for every interaction type: identical envelope
 * (browser.interaction event, INFO severity), a plain-string human-readable
 * body, and the structured fields as namespaced `interaction.*` log
 * attributes.
 */
export function emitInteractionEvent(evt: InteractionEvent): void {
  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes);

  // Read the page path back out of the attributes we just derived rather than
  // re-reading location.pathname: addCommonAttributes has already run it
  // through vars.urlAttributeScrubber, so the body cannot leak a segment the
  // consumer redacted. Missing key means the scrubber dropped url.path, threw,
  // or the url failed to parse -- in every one of those cases the path is meant
  // to stay out of the telemetry, so the suffix is omitted entirely.
  const scrubbedPath = findLastAttribute(attributes, PAGE_URL_PATH)?.value?.stringValue;

  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.INTERACTION);
  addAttribute(attributes, INTERACTION_ID, evt.id);
  addAttribute(attributes, INTERACTION_TYPE, evt.type);
  addAttribute(attributes, INTERACTION_NAME, evt.name);
  addAttribute(attributes, INTERACTION_NAME_SOURCE, evt.nameSource);
  addAttribute(attributes, INTERACTION_TARGET_SELECTOR, buildSelector(evt.element));
  addAttribute(attributes, INTERACTION_TARGET_TAG, evt.element.tagName.toLowerCase());
  if (evt.element.id) {
    addAttribute(attributes, INTERACTION_TARGET_ID, evt.element.id);
  }
  for (const extra of evt.extraAttributes ?? []) {
    attributes.push(extra);
  }

  const log: LogRecord = {
    timeUnixNano: nowNanos(),
    attributes,
    severityNumber: LOG_SEVERITIES.INFO,
    severityText: "INFO",
    body: {
      stringValue: scrubbedPath ? `${evt.title} on ${scrubbedPath}` : evt.title,
    },
  };

  sendLog(log);
}

/**
 * Builds a compact CSS-like selector describing the interaction target:
 * - `tag#id` when the target has an id.
 * - `tag.firstClass` when it has classes but no id.
 * - Otherwise, walks up to MAX_SELECTOR_ANCESTORS ancestors (each rendered the
 *   same way) joined with " > ", since there is no id anywhere to anchor on.
 *   The walk never crosses a BODY/HTML boundary -- those document-structure
 *   elements are not meaningful target context.
 * Result is capped at MAX_SELECTOR_LENGTH characters.
 *
 * The selector is best-effort display telemetry, NOT guaranteed valid CSS for
 * querySelector: ids/class names are not escaped and truncation may cut
 * mid-token.
 */
export function buildSelector(element: Element): string {
  if (element.id) {
    return truncateSelector(describeElement(element));
  }

  const parts: string[] = [describeElement(element)];
  let current: Element | null = element;
  for (let i = 0; i < MAX_SELECTOR_ANCESTORS; i++) {
    current = current.parentElement;
    if (!current || SELECTOR_BOUNDARY_TAGS.has(current.tagName)) break;
    parts.unshift(describeElement(current));
    if (current.id) break;
  }

  return truncateSelector(parts.join(" > "));
}

function truncateSelector(selector: string): string {
  return selector.length > MAX_SELECTOR_LENGTH ? selector.substring(0, MAX_SELECTOR_LENGTH) : selector;
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) {
    return `${tag}#${element.id}`;
  }
  const firstClass = element.classList.item(0);
  return firstClass ? `${tag}.${firstClass}` : tag;
}
