import { Endpoint, Vars, vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  DEPLOYMENT_NAME,
  PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_VERSION,
  USER_AGENT,
} from "../semantic-conventions";
import { fetch, generateUniqueId, PAGE_LOAD_ID_BYTES, warn, debug, perf, nav, win, NO_VALUE_FALLBACK } from "../utils";
import { trackSessions } from "./session";
import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";
import { startErrorInstrumentation } from "../instrumentations/errors";
import { addAttribute } from "../utils/otel";
import { instrumentFetch } from "../instrumentations/http/fetch";
import { AnyValue } from "../../types/otlp";
import { startNavigationInstrumentation } from "../instrumentations/navigation";
import { pick } from "../utils/pick";
import { merge } from "ts-deepmerge";
import { initializeTabId } from "../utils/tab-id";

export type InitOptions = {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  deploymentName?: string;
  deploymentId?: string;

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
} & Partial<
  Pick<
    Vars,
    | "ignoreUrls"
    | "ignoreErrorMessages"
    | "wrapEventHandlers"
    | "wrapTimers"
    | "propagateTraceHeadersCorsURLs"
    | "maxWaitForResourceTimingsMillis"
    | "maxToleranceForResourceTimingsMillis"
    | "headersToCapture"
    | "pageViewInstrumentation"
  >
>;

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

  Object.assign(
    vars,
    merge(
      vars,
      pick(opts, [
        "ignoreUrls",
        "ignoreErrorMessages",
        "wrapEventHandlers",
        "wrapTimers",
        "propagateTraceHeadersCorsURLs",
        "maxWaitForResourceTimingsMillis",
        "maxToleranceForResourceTimingsMillis",
        "headersToCapture",
        "pageViewInstrumentation",
      ])
    )
  );

  initializeResourceAttributes(opts);
  initializeSignalAttributes(opts);
  initializeTabId();
  trackSessions(opts.sessionInactivityTimeoutMillis, opts.sessionTerminationTimeoutMillis);
  startNavigationInstrumentation();
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

  const env = detectEnvironment(opts);
  if (env) {
    addAttribute(vars.resource.attributes, DEPLOYMENT_ENVIRONMENT_NAME, env);
  }

  const deploymentName = detectDeploymentName(opts);
  if (deploymentName) {
    addAttribute(vars.resource.attributes, DEPLOYMENT_NAME, deploymentName);
  }

  const deploymentId = detectDeploymentId(opts);
  if (deploymentId) {
    addAttribute(vars.resource.attributes, DEPLOYMENT_ID, deploymentId);
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

function detectEnvironment(opts: InitOptions): string | undefined {
  // if there is a manually specified value we use that
  if (opts.environment) {
    return opts.environment;
  }

  // if process isn't defined access to it causes an exception, but we can't check for its present due to how
  // plugins like webpack define work.
  try {
    // vercel
    // @ts-expect-error -- we need to access like this to allow webpack in the nextjs build to replace this
    return process?.env?.NEXT_PUBLIC_VERCEL_ENV;
  } catch (_ignored) {
    return undefined;
  }
}

function detectDeploymentName(opts: InitOptions): string | undefined {
  if (opts.deploymentName) {
    return opts.deploymentName;
  }

  // if process isn't defined access to it causes an exception, but we can't check for its present due to how
  // plugins like webpack define work.
  try {
    // vercel
    // @ts-expect-error -- we need to access like this to allow webpack in the nextjs build to replace this
    return process?.env?.NEXT_PUBLIC_VERCEL_TARGET_ENV;
  } catch (_ignored) {
    return undefined;
  }
}

function detectDeploymentId(opts: InitOptions): string | undefined {
  if (opts.deploymentId) {
    return opts.deploymentId;
  }

  // if process isn't defined access to it causes an exception, but we can't check for its present due to how
  // plugins like webpack define work.
  try {
    // vercel
    // @ts-expect-error -- we need to access like this to allow webpack in the nextjs build to replace this
    return process?.env?.NEXT_PUBLIC_VERCEL_BRANCH_URL;
  } catch (_ignored) {
    return undefined;
  }
}
