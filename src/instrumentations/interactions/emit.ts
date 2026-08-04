import { createRateLimiter, elementFirstClass, elementId, elementTag, nowNanos } from "../../utils";
import { debug } from "../../utils/debug";
import { sendLog } from "../../transport";
import { MAX_TRANSPORT_CALLS_PER_TEN_SECONDS } from "../../transport/limits";
import { DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS, vars } from "../../vars";
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

/** Shared cap for the two target descriptors: `target.selector` and `target.id`. */
const MAX_TARGET_VALUE_LENGTH = 128;
const MAX_SELECTOR_ANCESTORS = 3;
const SELECTOR_BOUNDARY_TAGS = new Set(["BODY", "HTML"]);

/** The attribute key `addCommonAttributes` emits the scrubbed page path under. */
const PAGE_URL_PATH = withPrefix(PAGE_URL_ATTR_PREFIX)(URL_PATH);

/**
 * How much of a ten-minute window interactions may use, relative to their
 * ten-second allowance. Keeps their share of the transport budget identical in
 * both windows: the default 32/10s maps to 512/10min, which is 1/8 of the
 * transport's 4096 -- the same ratio as 32 out of 128.
 */
const TEN_MINUTE_BUDGET_MULTIPLIER = 16;

let rateLimiter: (() => boolean) | undefined;

/**
 * Interaction events are the highest-frequency signal the SDK produces, so they
 * get their own budget instead of drawing on the transport-wide one in
 * transport/index.ts. Without it a burst of interactions evicts spans, errors,
 * page views and web vitals -- the telemetry people actually alert on -- leaving
 * only an invisible `debug()` trace behind.
 *
 * Created lazily, like the transport's own limiter: createRateLimiter registers
 * two intervals, interaction capture is opt-in, and the configured budget is
 * only known once init() has populated vars.
 */
function isRateLimited(): boolean {
  if (!rateLimiter) {
    // Clamped explicitly rather than leaning on createRateLimiter's `|| 32`
    // fallback, which would silently turn a configured 0 into the default.
    const configured = vars.interactionInstrumentation.maxEventsPerTenSeconds;
    const perTenSeconds =
      typeof configured === "number" && isFinite(configured)
        ? Math.max(1, Math.min(MAX_TRANSPORT_CALLS_PER_TEN_SECONDS, Math.floor(configured)))
        : DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS;

    rateLimiter = createRateLimiter({
      maxCallsPerTenSeconds: perTenSeconds,
      maxCallsPerTenMinutes: perTenSeconds * TEN_MINUTE_BUDGET_MULTIPLIER,
    });
  }

  return rateLimiter();
}

/** Test-only: forget the limiter so the next emit starts from a full budget. */
export function resetInteractionRateLimiterForTests(): void {
  rateLimiter = undefined;
}

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
  /**
   * Event time in epoch nanoseconds; defaults to now. Producers that coalesce a
   * burst of DOM events pass the time the burst *started*, so an event emitted
   * once the settle timer fires is still ordered by when the user acted -- which
   * is what keeps a coalesced key press and a coalesced change orderable against
   * each other, since they settle on independent timers.
   */
  timeUnixNano?: string;
};

/**
 * Shared emit path for every interaction type: identical envelope
 * (browser.interaction event, INFO severity), a plain-string human-readable
 * body, and the structured fields as namespaced `interaction.*` log
 * attributes.
 *
 * Every target descriptor is bounded -- `target.id` shares the selector's
 * MAX_TARGET_VALUE_LENGTH cap so a page with generated or state-carrying ids
 * cannot send unbounded strings on every interaction -- and is read through the
 * clobber-safe accessors in utils/dom, since a `<form>` target's `id`/`tagName`
 * can be shadowed by its own named controls.
 *
 * Interactions over their own rate-limit budget are dropped here, ahead of any
 * attribute derivation, so a spent budget also takes the selector and text
 * reads off the input-delay path. Note that the callers register their active
 * interaction *before* calling this, deliberately: a dropped log may leave a
 * span carrying a `user_interaction.id` with no matching log record, but the
 * span still carries `user_interaction.name`, whereas rate-limiting the
 * registration itself would silently break click-to-request correlation under
 * exactly the load where it is most interesting.
 */
export function emitInteractionEvent(evt: InteractionEvent): void {
  if (isRateLimited()) {
    debug("Dash0 interaction rate limit reached. Will not send interaction event.", evt.type);
    return;
  }

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
  addAttribute(attributes, INTERACTION_TARGET_TAG, elementTag(evt.element).toLowerCase());
  const targetId = elementId(evt.element);
  if (targetId) {
    addAttribute(attributes, INTERACTION_TARGET_ID, capTargetValue(targetId));
  }
  for (const extra of evt.extraAttributes ?? []) {
    attributes.push(extra);
  }

  const log: LogRecord = {
    timeUnixNano: evt.timeUnixNano ?? nowNanos(),
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
 * Result is capped at MAX_TARGET_VALUE_LENGTH characters.
 *
 * The selector is best-effort display telemetry, NOT guaranteed valid CSS for
 * querySelector: ids/class names are not escaped and truncation may cut
 * mid-token.
 */
export function buildSelector(element: Element): string {
  if (elementId(element)) {
    return capTargetValue(describeElement(element));
  }

  const parts: string[] = [describeElement(element)];
  let current: Element | null = element;
  for (let i = 0; i < MAX_SELECTOR_ANCESTORS; i++) {
    current = current.parentElement;
    if (!current || SELECTOR_BOUNDARY_TAGS.has(elementTag(current))) break;
    parts.unshift(describeElement(current));
    if (elementId(current)) break;
  }

  return capTargetValue(parts.join(" > "));
}

function capTargetValue(value: string): string {
  return value.length > MAX_TARGET_VALUE_LENGTH ? value.substring(0, MAX_TARGET_VALUE_LENGTH) : value;
}

function describeElement(element: Element): string {
  const tag = elementTag(element).toLowerCase();
  const id = elementId(element);
  if (id) {
    return `${tag}#${id}`;
  }
  const firstClass = elementFirstClass(element);
  return firstClass ? `${tag}.${firstClass}` : tag;
}
