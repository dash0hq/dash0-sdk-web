import { addAttribute, addEventListener, nowNanos, toKeyValue, win } from "../utils";
import { AnyValue, KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, PAGE_VIEW } from "../semantic-conventions";
import { sendLog } from "../transport";

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
