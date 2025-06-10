import { addEventListener, debug, doc, win, roundToTwoDecimals, error, toNanosTs, getTimeOrigin } from "../../utils";
import { KeyValue, LogRecord } from "../../../types/otlp";
import { EVENT_NAME, LOG_SEVERITIES, NAVIGATION_TIMING } from "../../semantic-conventions";
import { sendLog } from "../../transport";
import { getTraceContextForPageLoad, addAttribute } from "../../utils/otel";
import { addCommonAttributes } from "../../attributes";
import { transmitPageViewEvent } from "./event";

/**
 * Tracks page loads as per this OTel spec:
 * https://github.com/open-telemetry/semantic-conventions/pull/1910/files
 *
 * Notable difference: The full URL is transmitted as a signal attribute.
 */
export function startPageLoadInstrumentation() {
  try {
    transmitPageViewEvent(getStartTimeUnixNanos(), win?.location.href ? new URL(win?.location.href) : undefined);
  } catch (e) {
    error("Failed to transmit initial page view event", e);
  }

  if (doc?.readyState === "complete") {
    return onLoaded();
  }

  if (win) {
    addEventListener(win, "load", function () {
      // we want to get timing data for loadEventEnd,
      // so asynchronously process this
      setTimeout(onLoaded, 0);
    });
  }
}

/**
 * See https://github.com/open-telemetry/semantic-conventions/pull/1919
 */
function onLoaded() {
  const nt = win?.performance.getEntriesByType("navigation")[0];
  if (!nt) {
    debug("Navigation timings not available. Cannot emit navigation timing log");
    return;
  }

  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, NAVIGATION_TIMING);

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "name", nt.name);
  addNavigationTiming(bodyAttributes, nt, "responseStatus");

  addNavigationTiming(bodyAttributes, nt, "fetchStart");
  addNavigationTiming(bodyAttributes, nt, "requestStart");
  addNavigationTiming(bodyAttributes, nt, "responseStart");
  addNavigationTiming(bodyAttributes, nt, "domInteractive");
  addNavigationTiming(bodyAttributes, nt, "domContentLoadedEventEnd");
  addNavigationTiming(bodyAttributes, nt, "domComplete");
  addNavigationTiming(bodyAttributes, nt, "loadEventEnd");

  addNavigationTiming(bodyAttributes, nt, "transferSize");
  addNavigationTiming(bodyAttributes, nt, "encodedBodySize");
  addNavigationTiming(bodyAttributes, nt, "decodedBodySize");

  const log: LogRecord = {
    timeUnixNano: getStartTimeUnixNanos(),
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

  const traceContext = getTraceContextForPageLoad();
  if (traceContext) {
    log.traceId = traceContext.traceId;
    log.spanId = traceContext.spanId;
  }

  sendLog(log);
}

function addNavigationTiming(attributes: KeyValue[], nt: PerformanceNavigationTiming, field: string) {
  // @ts-expect-error index access not recognized by TS, but this makes the code more reusable
  const value = nt[field];
  if (typeof value === "number" && !isNaN(value)) {
    addAttribute(attributes, field, Number.isInteger(value) ? value : roundToTwoDecimals(value));
  }
}

function getStartTimeUnixNanos(): string {
  return toNanosTs(Math.round(getTimeOrigin()));
}
