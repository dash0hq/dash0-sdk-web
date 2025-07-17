import { AnyValue, KeyValue } from "../../types/otlp";
import { EVENT_NAME, EVENT_NAMES, WEB_EVENT_TITLE, LOG_SEVERITIES, LOG_SEVERITY_TEXT } from "../semantic-conventions";
import { sendLog } from "../transport";
import { addCommonAttributes } from "../attributes";
import { addAttribute, AttributeValueType, toAnyValue } from "../utils/otel";
import { nowNanos, TimeInput, toNanosTs, warn } from "../utils";

type EventOptions = {
  /**
   * Human readable title for the event.
   * Should summarize the event in a single short sentence.
   * Transmitted via the `dash0.web.event.title` attribute.
   */
  title?: string;

  /**
   * The timestamp at which the event happened.
   * Defaults to now
   */
  timestamp?: TimeInput;

  /**
   * The event body
   */
  data?: AttributeValueType | AnyValue;

  /**
   * Attributes to include with the event
   */
  attributes?: Record<string, AttributeValueType | AnyValue>;

  /**
   * The events log severity
   */
  severity?: LOG_SEVERITY_TEXT;
};

/**
 * Sends a custom event.
 * @param name The event name. Can not be any of the internal event names. See: EVENT_NAMES in src/semantic-conventions.
 * @param opts Additional event details.
 */
export function sendEvent(name: string, opts?: EventOptions) {
  if (Object.values(EVENT_NAMES).includes(name)) {
    warn(
      `Unable to send custom event ${name}. You are not allowed to use an internal event name while sending a custom event. Dropping event...`
    );
    return;
  }

  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes);
  Object.entries(opts?.attributes ?? {}).forEach(([key, value]) => addAttribute(attributes, key, value));

  addAttribute(attributes, EVENT_NAME, name);
  if (opts?.title) {
    addAttribute(attributes, WEB_EVENT_TITLE, opts.title);
  }

  sendLog({
    timeUnixNano: opts?.timestamp != null ? toNanosTs(opts.timestamp) : nowNanos(),
    attributes,
    body: toAnyValue(opts?.data),
    severityText: opts?.severity,
    severityNumber: opts?.severity ? LOG_SEVERITIES[opts.severity] : undefined,
  });
}
