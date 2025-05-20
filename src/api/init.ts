import { Endpoint, vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_VERSION,
  USER_AGENT,
} from "../semantic-conventions";
import { fetch, generateUniqueId, PAGE_LOAD_ID_BYTES, warn, debug, perf, nav, win, NO_VALUE_FALLBACK } from "../utils";
import { trackSessions } from "./session";
import { startPageLoadInstrumentation } from "../instrumentations/page-load";
import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";
import { startErrorInstrumentation } from "../instrumentations/errors";
import { addAttribute } from "../utils/otel";
import { instrumentFetch } from "../instrumentations/http/fetch";
import { AnyValue } from "../../types/otlp";

export type InitOptions = {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;

  /**
   * Additional attributes to include with transmitted signals
   */
  additionalSignalAttributes?: Record<string, string | number | AnyValue>;

  /**
   * OTLP endpoints to which the generated telemetry should be sent to.
   */
  endpoint: Endpoint | Endpoint[];

  /**
   * The  session inactivity timeout. Session inactivity is the maximum
   * allowed time to pass between two page loads before the session is considered
   * to be expired. Also think of cache time-to-idle configuration options.
   */
  sessionInactivityTimeoutMillis?: number;

  /**
   * The default session termination timeout. Session termination is the maximum
   * allowed time to pass since session start before the session is considered
   * to be expired. Also think of cache time-to-live configuration options.
   */
  sessionTerminationTimeoutMillis?: number;

  /**
   * An array of URL regular expression for which no data should be
   * collected. These regular expressions are evaluated against
   * the document, XMLHttpRequest, fetch and resource URLs.
   */
  ignoreUrls?: RegExp[];

  /**
   * An array of error message regular expressions for which no data
   * should be collected.
   */
  ignoreErrorMessages?: RegExp[];

  /**
   * Whether we should automatically wrap DOM event handlers
   * added via addEventListener for improved uncaught error tracking.
   * This results in improved uncaught error tracking for cross-origin
   * errors, but may have adverse effects on website performance and
   * stability.
   *
   * @default true
   */
  wrapEventHandlers?: boolean;

  /**
   * Whether we should automatically wrap timers
   * added via setTimeout / setInterval for improved uncaught error tracking.
   * This results in improved uncaught error tracking for cross-origin
   * errors, but may have adverse effects on website performance and
   * stability.
   *
   * @default true
   */
  wrapTimers?: boolean;

  /**
   * An array of URL regular expressions
   * for which trace context headers should be sent across origins by http client instrumentations.
   */
  propagateTraceHeadersCorsURLs?: RegExp[];

  /**
   * How long to wait after an XMLHttpRequest or fetch request has finished
   * for the retrieval of resource timing data. Performance timeline events
   * are placed on the low priority task queue and therefore high values
   * might be necessary.
   */
  maxWaitForResourceTimingsMillis?: number;

  /**
   * The number of milliseconds added to endTime so that performanceEntry is
   * available before endTime and backendTraceId does not become undefined for
   * xhr beacons
   */
  maxToleranceForResourceTimingsMillis?: number;

  /**
   * A set of regular expressions that will be matched against HTTP headers to be
   * captured in `XMLHttpRequest` and `fetch` Instrumentations.
   * These headers will be transferred as span attributes
   */
  headersToCapture?: RegExp[];
};

let hasBeenInitialised: boolean = false;

export function init(opts: InitOptions) {
  if (hasBeenInitialised) {
    debug("Dash0 SDK is being reinitialized, skipping ...");
    return;
  }

  if (!isClient()) {
    debug("Looks like we are not running in a browser context. Stopping Dash0 Web SDK initialization.");
    return;
  }

  if (!isSupported()) {
    debug("Stopping Dash0 Web SDK initialization. This browser does not support the necessary APIs");
    return;
  }

  vars.endpoints = opts.endpoint instanceof Array ? opts.endpoint : [opts.endpoint];
  if (vars.endpoints.length === 0) {
    warn("No telemetry endpoint configured. Aborting Dash0 Web SDK initialization process.");
    return;
  }

  vars.ignoreUrls = opts.ignoreUrls ?? vars.ignoreUrls;
  vars.ignoreErrorMessages = opts.ignoreErrorMessages ?? vars.ignoreErrorMessages;
  vars.wrapEventHandlers = opts.wrapEventHandlers ?? vars.wrapEventHandlers;
  vars.wrapTimers = opts.wrapTimers ?? vars.wrapTimers;
  vars.propagateTraceHeadersCorsURLs = opts.propagateTraceHeadersCorsURLs ?? vars.propagateTraceHeadersCorsURLs;
  vars.maxWaitForResourceTimingsMillis = opts.maxWaitForResourceTimingsMillis ?? vars.maxWaitForResourceTimingsMillis;
  vars.maxToleranceForResourceTimingsMillis =
    opts.maxToleranceForResourceTimingsMillis ?? vars.maxToleranceForResourceTimingsMillis;
  vars.headersToCapture = opts.headersToCapture ?? vars.headersToCapture;

  initializeResourceAttributes(opts);
  initializeSignalAttributes(opts);
  trackSessions(opts.sessionInactivityTimeoutMillis, opts.sessionTerminationTimeoutMillis);
  startPageLoadInstrumentation();
  startWebVitalsInstrumentation();
  startErrorInstrumentation();
  instrumentFetch();

  hasBeenInitialised = true;
}

function initializeResourceAttributes(opts: InitOptions) {
  addAttribute(vars.resource.attributes, SERVICE_NAME, opts["serviceName"]);

  if (opts.serviceVersion) {
    addAttribute(vars.resource.attributes, SERVICE_VERSION, opts["serviceVersion"]);
  }
  if (opts.environment) {
    addAttribute(vars.resource.attributes, DEPLOYMENT_ENVIRONMENT_NAME, opts["environment"]);
  }
}

function initializeSignalAttributes(opts: InitOptions) {
  addAttribute(vars.signalAttributes, PAGE_LOAD_ID, generateUniqueId(PAGE_LOAD_ID_BYTES));
  addAttribute(vars.signalAttributes, USER_AGENT, nav?.userAgent ?? NO_VALUE_FALLBACK);

  if (opts.additionalSignalAttributes) {
    Object.entries(opts.additionalSignalAttributes).forEach(([key, value]) => {
      addAttribute(vars.signalAttributes, key, value);
    });
  }
}

function isSupported() {
  return typeof fetch === "function" && perf && perf.getEntriesByType;
}

function isClient() {
  return win != null;
}
