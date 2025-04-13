import { onLCP, onINP, onCLS, Metric } from "web-vitals";
import { KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, WEB_VITAL } from "../semantic-conventions";
import { addAttribute, nowNanos } from "../utils";
import { sendLog } from "../transport";

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
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };
  sendLog(log);
}
