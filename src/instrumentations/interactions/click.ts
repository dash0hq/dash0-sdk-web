import { nowNanos, win } from "../../utils";
import { debug } from "../../utils/debug";
import { sendLog } from "../../transport";
import {
  EVENT_NAME,
  EVENT_NAMES,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_ID,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TYPE,
  LOG_SEVERITIES,
} from "../../semantic-conventions";
import { addAttribute } from "../../utils/otel";
import { addCommonAttributes } from "../../attributes";
import { KeyValue, LogRecord } from "../../types/otlp";
import { vars } from "../../vars";
import { deriveActionName } from "./action-name";

const MAX_SELECTOR_LENGTH = 128;
const MAX_SELECTOR_ANCESTORS = 3;
const SELECTOR_BOUNDARY_TAGS = new Set(["BODY", "HTML"]);

let listenerAttached = false;

function onWindowClick(event: Event) {
  if (!event.isTrusted) return;
  handleClick(event);
}

export function startClickInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("click", onWindowClick, { capture: true });
  listenerAttached = true;
}

/**
 * Test-only teardown. Production code has no need to stop this listener --
 * matching the errors/index.ts precedent of start-only lifecycle -- but unit
 * tests need to avoid leaking a real window listener across test cases.
 */
export function stopClickInstrumentationForTests() {
  if (!listenerAttached || !win) return;
  win.removeEventListener("click", onWindowClick, { capture: true } as EventListenerOptions);
  listenerAttached = false;
}

/**
 * Handles a click event and, if the target is a valid Element, builds and
 * transmits a `browser.interaction` log. Exported separately from the
 * `isTrusted` gate in the real listener (see `onWindowClick`) so unit tests
 * can exercise the full event-building path directly: jsdom's
 * `dispatchEvent`, like real browsers, always produces `isTrusted: false`,
 * so a trust-gated entry point cannot be driven by synthetic test events.
 */
export function handleClick(event: Event): void {
  try {
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) {
      return;
    }

    const element = target as Element;
    const { name, nameSource } = deriveActionName(element, vars.interactionInstrumentation.actionNameAttribute!);
    const selector = buildSelector(element);

    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);
    addAttribute(attributes, EVENT_NAME, EVENT_NAMES.INTERACTION);

    const bodyValues: KeyValue[] = [];
    addAttribute(bodyValues, INTERACTION_TYPE, "click");
    addAttribute(bodyValues, INTERACTION_NAME, name);
    addAttribute(bodyValues, INTERACTION_NAME_SOURCE, nameSource);
    addAttribute(bodyValues, INTERACTION_TARGET_SELECTOR, selector);
    addAttribute(bodyValues, INTERACTION_TARGET_TAG, element.tagName.toLowerCase());
    if (element.id) {
      addAttribute(bodyValues, INTERACTION_TARGET_ID, element.id);
    }

    const log: LogRecord = {
      timeUnixNano: nowNanos(),
      attributes,
      severityNumber: LOG_SEVERITIES.INFO,
      severityText: "INFO",
      body: {
        kvlistValue: { values: bodyValues },
      },
    };

    sendLog(log);
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a click event.", err);
  }
}

/**
 * Builds a compact CSS-like selector describing the click target:
 * - `tag#id` when the target has an id.
 * - `tag.firstClass` when it has classes but no id.
 * - Otherwise, walks up to MAX_SELECTOR_ANCESTORS ancestors (each rendered the
 *   same way) joined with " > ", since there is no id anywhere to anchor on.
 *   The walk never crosses a BODY/HTML boundary -- those document-structure
 *   elements are not meaningful click-target context.
 * Result is capped at MAX_SELECTOR_LENGTH characters.
 *
 * The selector is best-effort display telemetry, NOT guaranteed valid CSS for
 * querySelector: ids/class names are not escaped and truncation may cut
 * mid-token.
 */
function buildSelector(element: Element): string {
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
