import { vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  DEPLOYMENT_NAME,
  PAGE_LOAD_ID,
  SERVICE_NAME,
  SERVICE_NAMESPACE,
  SERVICE_VERSION,
  USER_AGENT,
} from "../semantic-conventions";
import {
  fetch,
  generateUniqueId,
  isSafeServiceName,
  PAGE_LOAD_ID_BYTES,
  warn,
  debug,
  perf,
  nav,
  win,
  NO_VALUE_FALLBACK,
  pick,
  loc,
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
import { BrowserBuildEnv, pickFirstString } from "./browser-env";
import { applyVcsResourceAttributes } from "./vcs";

declare const process: { env?: BrowserBuildEnv } | undefined;

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
    debug("Stopping Dash0 Web SDK initialization. This browser does not support the necessary APIs.");
    return;
  }

  const trimmedServiceName = opts.serviceName.trim();
  if (!trimmedServiceName) {
    debug("Missing or empty serviceName value. Falling back to location.hostname.");
    opts.serviceName = loc?.hostname ?? "unknown";
  } else if (opts.rejectSuspiciousServiceName !== false && !isSafeServiceName(trimmedServiceName)) {
    debug("serviceName contains disallowed characters. Falling back to location.hostname.");
    opts.serviceName = loc?.hostname ?? "unknown";
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
        "enableTransportCompression",
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

  if (opts.serviceNamespace) {
    addAttribute(vars.resource.attributes, SERVICE_NAMESPACE, opts["serviceNamespace"]);
  }

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

  applyVcsResourceAttributes(opts);
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

// Vercel auto-prefixes its system env vars under every framework preset
// (see https://vercel.com/docs/environment-variables/framework-environment-variables).
// The shared `FrameworkPrefix` union in `./browser-env` is the single source
// of truth for which prefixes the SDK recognises. To add a new prefix, edit
// it there; the literal accessors below pick it up automatically via the
// typed `process.env` declaration.

function detectEnvironment(opts: InitOptions): string | undefined {
  if (opts.environment) {
    return opts.environment;
  }
  try {
    return pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_ENV,
      process?.env?.NUXT_ENV_VERCEL_ENV,
      process?.env?.REACT_APP_VERCEL_ENV,
      process?.env?.GATSBY_VERCEL_ENV,
      process?.env?.VITE_VERCEL_ENV,
      process?.env?.PUBLIC_VERCEL_ENV,
      process?.env?.VUE_APP_VERCEL_ENV,
      process?.env?.REDWOOD_ENV_VERCEL_ENV,
      process?.env?.SANITY_STUDIO_VERCEL_ENV
    );
  } catch (_ignored) {
    return undefined;
  }
}

function detectDeploymentName(opts: InitOptions): string | undefined {
  if (opts.deploymentName) {
    return opts.deploymentName;
  }
  try {
    return pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_TARGET_ENV,
      process?.env?.NUXT_ENV_VERCEL_TARGET_ENV,
      process?.env?.REACT_APP_VERCEL_TARGET_ENV,
      process?.env?.GATSBY_VERCEL_TARGET_ENV,
      process?.env?.VITE_VERCEL_TARGET_ENV,
      process?.env?.PUBLIC_VERCEL_TARGET_ENV,
      process?.env?.VUE_APP_VERCEL_TARGET_ENV,
      process?.env?.REDWOOD_ENV_VERCEL_TARGET_ENV,
      process?.env?.SANITY_STUDIO_VERCEL_TARGET_ENV
    );
  } catch (_ignored) {
    return undefined;
  }
}

function detectDeploymentId(opts: InitOptions): string | undefined {
  if (opts.deploymentId) {
    return opts.deploymentId;
  }
  try {
    return pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_BRANCH_URL,
      process?.env?.NUXT_ENV_VERCEL_BRANCH_URL,
      process?.env?.REACT_APP_VERCEL_BRANCH_URL,
      process?.env?.GATSBY_VERCEL_BRANCH_URL,
      process?.env?.VITE_VERCEL_BRANCH_URL,
      process?.env?.PUBLIC_VERCEL_BRANCH_URL,
      process?.env?.VUE_APP_VERCEL_BRANCH_URL,
      process?.env?.REDWOOD_ENV_VERCEL_BRANCH_URL,
      process?.env?.SANITY_STUDIO_VERCEL_BRANCH_URL
    );
  } catch (_ignored) {
    return undefined;
  }
}

function initializePropagators(opts: InitOptions) {
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
    // Convert legacy config to new format - only include cross-origin URLs since same-origin is automatic
    vars.propagators = [
      {
        type: "traceparent",
        match: [...opts.propagateTraceHeadersCorsURLs],
      },
    ];
  }
  // Default configuration - traceparent with empty match array
  // Same-origin requests get ALL configured propagators, so this ensures traceparent for same-origin
  else {
    vars.propagators = [
      {
        type: "traceparent",
        match: [],
      },
    ];
  }
}

function isInstrumentationEnabled(name: InstrumentationName, opts: InitOptions): boolean {
  const instrumentations = opts.enabledInstrumentations;

  if (!instrumentations) return true;

  return instrumentations.includes(name);
}
