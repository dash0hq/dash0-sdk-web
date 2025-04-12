import { Endpoint, vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME, PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_VERSION, USER_AGENT,
} from "../semantic-conventions";
import { addAttribute, generateUniqueId, PAGE_LOAD_ID_BYTES, warn } from "../utils";
import { trackSessions } from "./session";

export type InitOptions = {
  ["serviceName"]: string;
  ["serviceVersion"]?: string;
  ["environment"]?: string;

  /**
   * OTLP endpoints to which the generated telemetry should be sent to.
   */
  ["endpoint"]: Endpoint;

  /**
   * The  session inactivity timeout. Session inactivity is the maximum
   * allowed time to pass between two page loads before the session is considered
   * to be expired. Also think of cache time-to-idle configuration options.
   */
  "sessionInactivityTimeoutMillis"?: number,

  /**
   * The default session termination timeout. Session termination is the maximum
   * allowed time to pass since session start before the session is considered
   * to be expired. Also think of cache time-to-live configuration options.
   */
  "sessionTerminationTimeoutMillis"?: number
}

export function init(opts: InitOptions) {
  vars.endpoints = [opts["endpoint"]];

  if (vars.endpoints.length===0) {
    warn("No telemetry endpoint configured. Aborting Dash0 Web SDK initialization process.");
    return;
  }

  initializeResourceAttributes(opts);
  initializeSignalAttributes();
  trackSessions(opts.sessionInactivityTimeoutMillis, opts.sessionTerminationTimeoutMillis);
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

  // TODO connection type
  // TODO window hidden
  // TODO window width
  // TODO window height
}
