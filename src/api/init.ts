import { Endpoint, vars } from "../vars";
import { addAttribute } from "../util";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  SERVICE_NAME,
  SERVICE_VERSION,
} from "../semantic-conventions";

export type InitOptions = {
  ["serviceName"]: string;
  ["serviceVersion"]?: string;
  ["environment"]?: string;

  /**
   * OTLP endpoints to which the generated telemetry should be sent to.
   */
  ["endpoint"]: Endpoint;
}

export function init(opts: InitOptions) {
  addAttribute(vars.resource.attributes, SERVICE_NAME, opts["serviceName"]);

  if (opts.serviceVersion) {
    addAttribute(vars.resource.attributes, SERVICE_VERSION, opts["serviceVersion"]);
  }
  if (opts.environment) {
    addAttribute(vars.resource.attributes, DEPLOYMENT_ENVIRONMENT_NAME, opts["environment"]);
  }

  vars.endpoints = [opts["endpoint"]];
}
