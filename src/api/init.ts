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
  VCS_CHANGE_ID,
  VCS_OWNER_NAME,
  VCS_PROVIDER_NAME,
  VCS_REF_HEAD_NAME,
  VCS_REF_HEAD_REVISION,
  VCS_REPOSITORY_NAME,
  VCS_REPOSITORY_URL_FULL,
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

type VcsAttributes = {
  providerName?: string;
  ownerName?: string;
  repositoryName?: string;
  repositoryUrlFull?: string;
  refHeadName?: string;
  refHeadRevision?: string;
  changeId?: string;
};

function applyVcsResourceAttributes(opts: InitOptions) {
  const vcs = detectVcs(opts);
  if (vcs.providerName) {
    addAttribute(vars.resource.attributes, VCS_PROVIDER_NAME, vcs.providerName);
  }
  if (vcs.ownerName) {
    addAttribute(vars.resource.attributes, VCS_OWNER_NAME, vcs.ownerName);
  }
  if (vcs.repositoryName) {
    addAttribute(vars.resource.attributes, VCS_REPOSITORY_NAME, vcs.repositoryName);
  }
  if (vcs.repositoryUrlFull) {
    addAttribute(vars.resource.attributes, VCS_REPOSITORY_URL_FULL, vcs.repositoryUrlFull);
  }
  if (vcs.refHeadName) {
    addAttribute(vars.resource.attributes, VCS_REF_HEAD_NAME, vcs.refHeadName);
  }
  if (vcs.refHeadRevision) {
    addAttribute(vars.resource.attributes, VCS_REF_HEAD_REVISION, vcs.refHeadRevision);
  }
  if (vcs.changeId) {
    addAttribute(vars.resource.attributes, VCS_CHANGE_ID, vcs.changeId);
  }
}

function detectVcs(opts: InitOptions): VcsAttributes {
  if (opts.disableVcsDetection) {
    return {};
  }

  const vercel = detectVcsFromVercel();
  const netlify = detectVcsFromNetlify();
  const override = opts.vcs ?? {};

  return {
    providerName: override.providerName ?? vercel.providerName ?? netlify.providerName,
    ownerName: override.ownerName ?? vercel.ownerName ?? netlify.ownerName,
    repositoryName: override.repositoryName ?? vercel.repositoryName ?? netlify.repositoryName,
    repositoryUrlFull: override.repositoryUrlFull ?? vercel.repositoryUrlFull ?? netlify.repositoryUrlFull,
    refHeadName: override.refHeadName ?? vercel.refHeadName ?? netlify.refHeadName,
    refHeadRevision: override.refHeadRevision ?? vercel.refHeadRevision ?? netlify.refHeadRevision,
    changeId: override.changeId ?? vercel.changeId ?? netlify.changeId,
  };
}

function detectVcsFromVercel(): VcsAttributes {
  // Vercel exposes its system git env vars to the browser bundle by also
  // emitting `NEXT_PUBLIC_VERCEL_GIT_*` variants. Each read goes through the
  // literal `process.env.NAME` form on purpose: webpack DefinePlugin (and
  // friends) replace these at build time only when they see the literal
  // accessor — a dynamic lookup like `process.env[name]` is not substituted
  // and would resolve to `undefined` in the browser.
  let provider: string | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | undefined;
  let revision: string | undefined;
  let changeId: string | undefined;
  try {
    // @ts-expect-error -- literal accessor required for build-time replacement
    provider = process?.env?.NEXT_PUBLIC_VERCEL_GIT_PROVIDER;
    // @ts-expect-error -- literal accessor required for build-time replacement
    owner = process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER;
    // @ts-expect-error -- literal accessor required for build-time replacement
    repo = process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG;
    // @ts-expect-error -- literal accessor required for build-time replacement
    ref = process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;
    // @ts-expect-error -- literal accessor required for build-time replacement
    revision = process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    // @ts-expect-error -- literal accessor required for build-time replacement
    changeId = process?.env?.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID;
  } catch (_ignored) {
    // process is not defined (or some bundler shimmed it strangely) — skip.
  }

  return {
    providerName: provider,
    ownerName: owner,
    repositoryName: repo,
    repositoryUrlFull: buildRepositoryUrlFromVercel(provider, owner, repo),
    refHeadName: ref,
    refHeadRevision: revision,
    changeId,
  };
}

function detectVcsFromNetlify(): VcsAttributes {
  // Netlify exposes read-only build env vars that the user must surface to the
  // browser bundle themselves — for Next.js that means setting
  // `NEXT_PUBLIC_*` variants (e.g. `NEXT_PUBLIC_REPOSITORY_URL = $REPOSITORY_URL`).
  // Same `process.env.NAME` literal-accessor requirement as the Vercel path.
  let repositoryUrl: string | undefined;
  let branch: string | undefined;
  let commit: string | undefined;
  let reviewId: string | undefined;
  try {
    // @ts-expect-error -- literal accessor required for build-time replacement
    repositoryUrl = process?.env?.NEXT_PUBLIC_REPOSITORY_URL;
    // @ts-expect-error -- literal accessor required for build-time replacement
    branch = process?.env?.NEXT_PUBLIC_BRANCH;
    // @ts-expect-error -- literal accessor required for build-time replacement
    commit = process?.env?.NEXT_PUBLIC_COMMIT_REF;
    // @ts-expect-error -- literal accessor required for build-time replacement
    reviewId = process?.env?.NEXT_PUBLIC_REVIEW_ID;
  } catch (_ignored) {
    // process is not defined — skip.
  }

  const parsed = parseRepositoryUrl(repositoryUrl);
  return {
    providerName: parsed?.providerName,
    ownerName: parsed?.ownerName,
    repositoryName: parsed?.repositoryName,
    repositoryUrlFull: repositoryUrl,
    refHeadName: branch,
    refHeadRevision: commit,
    changeId: reviewId,
  };
}

function buildRepositoryUrlFromVercel(
  provider: string | undefined,
  owner: string | undefined,
  repo: string | undefined
): string | undefined {
  if (!provider || !owner || !repo) return undefined;
  const host = vcsHostForProvider(provider);
  if (!host) return undefined;
  return `https://${host}/${owner}/${repo}`;
}

// Single source of truth for provider↔host mapping. Both `vcsHostForProvider`
// (Vercel path: provider name is known, derive the canonical host) and
// `vcsProviderForHost` (Netlify path: only the URL is known, derive the
// provider) consult this map so adding a provider is one edit.
const VCS_PROVIDER_HOSTS: Record<string, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

function vcsHostForProvider(provider: string): string | undefined {
  return VCS_PROVIDER_HOSTS[provider];
}

function parseRepositoryUrl(
  url: string | undefined
): { providerName: string; ownerName: string; repositoryName: string } | undefined {
  if (!url) return undefined;

  let host: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    host = parsed.host;
    pathname = parsed.pathname;
  } catch (_ignored) {
    return undefined;
  }

  const provider = vcsProviderForHost(host);
  if (!provider) return undefined;

  const trimmed = pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  const segments = trimmed.split("/");
  if (segments.length < 2) return undefined;

  const ownerName = segments[0];
  // Bitbucket and GitLab can have nested groups; the repository slug is the
  // last path segment. GitHub paths are always two segments.
  const repositoryName = segments[segments.length - 1];
  if (!ownerName || !repositoryName) return undefined;

  return { providerName: provider, ownerName, repositoryName };
}

function vcsProviderForHost(host: string): string | undefined {
  for (const provider in VCS_PROVIDER_HOSTS) {
    const providerHost = VCS_PROVIDER_HOSTS[provider];
    if (host === providerHost || host.endsWith(`.${providerHost}`)) {
      return provider;
    }
  }
  return undefined;
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
