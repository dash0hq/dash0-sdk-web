import { onLCP, onINP, onCLS, Metric } from "web-vitals";
import { KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, LOG_SERVERITY_INFO_TEXT, LOG_SEVERITY_INFO, WEB_VITAL } from "../semantic-conventions";
import { addAttribute, nowNanos } from "../utils";
import { sendLog } from "../transport";
import { addCommonSignalAttributes } from "../add-common-signal-attributes";

export function startWebVitalsInstrumentation() {
  onLCP(onWebVital);
  onINP(onWebVital);
  onCLS(onWebVital);
}

function onWebVital(metric: Metric) {
  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, WEB_VITAL);

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "name", metric.name);
  addAttribute(bodyAttributes, "value", metric.value);
  addAttribute(bodyAttributes, "delta", metric.delta);

  const log: LogRecord = {
    timeUnixNano: nowNanos(),
    attributes: attributes,
    severityNumber: LOG_SEVERITY_INFO,
    severityText: LOG_SERVERITY_INFO_TEXT,
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };
  addCommonSignalAttributes(log.attributes);
  sendLog(log);
}
