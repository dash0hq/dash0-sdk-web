import { onLCP, onINP, onCLS, Metric } from "web-vitals";
import { KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, LOG_SEVERITIES, WEB_VITAL } from "../semantic-conventions";
import { nowNanos, roundToTwoDecimals } from "../utils";
import { sendLog } from "../transport";
import { addAttribute } from "../utils/otel";
import { addCommonAttributes } from "../attributes";

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
  addAttribute(bodyAttributes, "value", roundToTwoDecimals(metric.value));
  addAttribute(bodyAttributes, "delta", roundToTwoDecimals(metric.delta));

  const log: LogRecord = {
    timeUnixNano: nowNanos(),
    attributes: attributes,
    severityNumber: LOG_SEVERITIES.INFO,
    severityText: "INFO",
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };
  addCommonAttributes(log.attributes);
  sendLog(log);
}
