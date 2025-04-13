import { Endpoint, vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_VERSION,
  USER_AGENT,
} from "../semantic-conventions";
import { addAttribute, fetch, generateUniqueId, PAGE_LOAD_ID_BYTES, warn, debug, perf } from "../utils";
import { trackSessions } from "./session";
import { startPageLoadInstrumentation } from "../instrumentations/page-load";
import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";
import { startErrorInstrumentation } from "../instrumentations/errors";

export type InitOptions = {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;

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
};

export function init(opts: InitOptions) {
  if (!isSupported()) {
    debug("Stopping Dash0 Web SDK initialization. This browser does not support the necessary APIs");
    return;
  }

  vars.endpoints = opts.endpoint instanceof Array ? opts.endpoint : [opts.endpoint];
  if (vars.endpoints.length === 0) {
    warn("No telemetry endpoint configured. Aborting Dash0 Web SDK initialization process.");
    return;
  }

  vars.ignoreUrls = opts.ignoreUrls ?? [];
  vars.ignoreErrorMessages = opts.ignoreErrorMessages ?? [];
  vars.wrapEventHandlers = opts.wrapEventHandlers ?? true;
  vars.wrapTimers = opts.wrapTimers ?? true;

  initializeResourceAttributes(opts);
  initializeSignalAttributes();
  trackSessions(opts.sessionInactivityTimeoutMillis, opts.sessionTerminationTimeoutMillis);
  startPageLoadInstrumentation();
  startWebVitalsInstrumentation();
  startErrorInstrumentation();
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

function initializeSignalAttributes() {
  addAttribute(vars.signalAttributes, PAGE_LOAD_ID, generateUniqueId(PAGE_LOAD_ID_BYTES));
  addAttribute(vars.signalAttributes, USER_AGENT, window.navigator.userAgent);
}

function isSupported() {
  return typeof fetch === "function" && perf && perf.getEntriesByType;
}
