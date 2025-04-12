import { addAttribute, addEventListener, nowNanos, toKeyValue, win } from "../utils";
import { AnyValue, KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, PAGE_VIEW } from "../semantic-conventions";
import { sendLog } from "../transport";

/**
 * Tracks page loads as per this OTel spec:
 * https://github.com/open-telemetry/semantic-conventions/pull/1910/files
 *
 * Notable difference: The full URL is transmitted as a signal attribute.
 */
export function startPageLoadInstrumentation() {
  if (document.readyState === "complete") {
    return onReady();
  }
  addEventListener(win, "load", function () {
    // we want to get timing data for loadEventEnd,
    // so asynchronously process this
    setTimeout(onReady, 0);
  });
}

function onReady() {
  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, PAGE_VIEW);

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "type", 0);
  addAttribute(bodyAttributes, "title", document.title);
  if (document.referrer) {
    addAttribute(bodyAttributes, "referrer", document.referrer);
  }

  // TODO page load timings - separate event?
  // https://github.com/open-telemetry/semantic-conventions/pull/1919/files

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
