import { vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  DEPLOYMENT_NAME,
  PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_VERSION,
  USER_AGENT,
} from "../semantic-conventions";
import {
  fetch,
  generateUniqueId,
  PAGE_LOAD_ID_BYTES,
  warn,
  debug,
  perf,
  nav,
  win,
  NO_VALUE_FALLBACK,
  pick,
} from "../utils";
import { trackSessions } from "./session";
import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";
import { startErrorInstrumentation } from "../instrumentations/errors";
import { addAttribute } from "../utils/otel";
import { instrumentFetch } from "../instrumentations/http/fetch";
import { startNavigationInstrumentation } from "../instrumentations/navigation";
import { merge } from "ts-deepmerge";
import { initializeTabId } from "../utils/tab-id";
import { InitOptions, InstrumentationName } from "../types/options";

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
        "urlAttributeScrubber",
        "pageViewInstrumentation",
      ])
    )
  );

  initializePropagators(opts);

  initializeResourceAttributes(opts);
  initializeSignalAttributes(opts);
  initializeTabId();
  trackSessions(opts.sessionInactivityTimeoutMillis, opts.sessionTerminationTimeoutMillis);

  if (isInstrumentationEnabled("@dash0/navigation", opts)) {
    startNavigationInstrumentation();
  }
  if (isInstrumentationEnabled("@dash0/web-vitals", opts)) {
    startWebVitalsInstrumentation();
  }
  if (isInstrumentationEnabled("@dash0/error", opts)) {
    startErrorInstrumentation();
  }
  if (isInstrumentationEnabled("@dash0/fetch", opts)) {
    instrumentFetch();
  }

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

function initializePropagators(opts: InitOptions) {
  // Handle new propagators configuration
  if (opts.propagators) {
    if (opts.propagateTraceHeadersCorsURLs) {
      warn(
        "Both 'propagators' and deprecated 'propagateTraceHeadersCorsURLs' were provided. Using 'propagators' configuration. Please migrate to the new 'propagators' config."
      );
    }
    vars.propagators = opts.propagators;
  }
  // Handle legacy configuration
  else if (opts.propagateTraceHeadersCorsURLs && opts.propagateTraceHeadersCorsURLs.length > 0) {
    warn("'propagateTraceHeadersCorsURLs' is deprecated. Please use the new 'propagators' configuration.");
    // Convert legacy config to new format
    vars.propagators = [
      {
        type: "traceparent",
        match: opts.propagateTraceHeadersCorsURLs,
      },
    ];
  }
  // Default configuration - keep existing behavior
  else {
    vars.propagators = undefined;
  }
}

function isInstrumentationEnabled(name: InstrumentationName, opts: InitOptions): boolean {
  const instrumentations = opts.enabledInstrumentations;

  if (!instrumentations) return true;

  return instrumentations.includes(name);
}
