import { addAttribute, addEventListener, debug, nowNanos, win } from "../utils";
import { KeyValue, LogRecord } from "../../types/otlp";
import { EVENT_NAME, NAVIGATION_TIMING, PAGE_VIEW } from "../semantic-conventions";
import { sendLog } from "../transport";
import { getTraceContextForPageLoad } from "../utils/trace-context";

/**
 * Tracks page loads as per this OTel spec:
 * https://github.com/open-telemetry/semantic-conventions/pull/1910/files
 *
 * Notable difference: The full URL is transmitted as a signal attribute.
 */
export function startPageLoadInstrumentation() {
  onInit();

  if (document.readyState === "complete") {
    return onLoaded();
  }
  addEventListener(win, "load", function () {
    // we want to get timing data for loadEventEnd,
    // so asynchronously process this
    setTimeout(onLoaded, 0);
  });
}

/**
 * See https://github.com/open-telemetry/semantic-conventions/pull/1910
 */
function onInit() {
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

  const traceContext = getTraceContextForPageLoad();
  if (traceContext) {
    log.traceId = traceContext.traceId;
    log.spanId = traceContext.spanId;
  }

  sendLog(log);
}

/**
 * See https://github.com/open-telemetry/semantic-conventions/pull/1919
 */
function onLoaded() {
  const nt = win.performance.getEntriesByType("navigation")[0];
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
    timeUnixNano: nowNanos(),
    attributes: attributes,
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };

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
    addAttribute(attributes, field, value);
  }
}
