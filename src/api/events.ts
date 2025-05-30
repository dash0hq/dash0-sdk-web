import { AnyValue, KeyValue } from "../../types/otlp";
import { EVENT_NAME, LOG_SEVERITIES, LOG_SEVERITY_TEXT } from "../semantic-conventions";
import { sendLog } from "../transport";
import { addCommonAttributes } from "../attributes";
import { addAttribute, AttributeValueType, toAnyValue } from "../utils/otel";
import { nowNanos, TimeInput, toNanosTs } from "../utils";

type EventOptions = {
  timestamp?: TimeInput;
  name: string;
  data?: AttributeValueType | AnyValue;
  attributes?: Record<string, AttributeValueType | AnyValue>;
  severity?: LOG_SEVERITY_TEXT;
};

export function sendEvent(name: string, opts?: EventOptions) {
  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes);
  Object.entries(opts?.attributes ?? {}).forEach(([key, value]) => addAttribute(attributes, key, value));

  addAttribute(attributes, EVENT_NAME, name);

  sendLog({
    timeUnixNano: opts?.timestamp != null ? toNanosTs(opts.timestamp) : nowNanos(),
    attributes,
    body: toAnyValue(opts?.data),
    severityText: opts?.severity,
    severityNumber: opts?.severity ? LOG_SEVERITIES[opts.severity] : undefined,
  });
}
