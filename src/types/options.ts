import { AttributeValueType } from "../utils/otel";
import { AnyValue } from "./otlp";
import { Endpoint, Vars, PropagatorConfig } from "../vars";

export type InstrumentationName = "@dash0/navigation" | "@dash0/web-vitals" | "@dash0/error" | "@dash0/fetch";

export type InitOptions = {
  serviceName: string;
  serviceNamespace?: string;
  serviceVersion?: string;
  environment?: string;
  deploymentName?: string;
  deploymentId?: string;

  /**
   * Additional attributes to include with transmitted signals
   */
  additionalSignalAttributes?: Record<string, AttributeValueType | AnyValue>;

  /**
   * When enabled (the default), reject `serviceName` values that contain
   * characters commonly associated with injection payloads (quotes, angle
   * brackets, braces, semicolons, control characters) and fall back to
   * `location.hostname`. This guards against automated security scanners or
   * untrusted callers influencing the value sent to `init()`.
   *
   * Set to `false` to opt out and pass the `serviceName` through unchanged.
   */
  rejectSuspiciousServiceName?: boolean;

  /**
   * When `true`, disable auto-detection of VCS (version control) context
   * from the build environment. By default the SDK reads VCS context from
   * Vercel (`NEXT_PUBLIC_VERCEL_GIT_*`) and Netlify
   * (`NEXT_PUBLIC_REPOSITORY_URL`, `NEXT_PUBLIC_BRANCH`,
   * `NEXT_PUBLIC_COMMIT_REF`, `NEXT_PUBLIC_REVIEW_ID`) and applies the values
   * as resource attributes following the OTel `vcs.*` semantic conventions:
   *
   *   - vcs.provider.name
   *   - vcs.owner.name
   *   - vcs.repository.name
   *   - vcs.repository.url.full
   *   - vcs.ref.head.name
   *   - vcs.ref.head.revision
   *   - vcs.change.id
   *
   * Pairing telemetry with the git commit + branch the build came from lets
   * Dash0 Agent answer questions like "which PR introduced this error?".
   */
  disableVcsDetection?: boolean;

  /**
   * Manually specify VCS (version control) context. Each provided field
   * overrides the value the SDK would otherwise auto-detect from the build
   * environment for that attribute. Use this for non-Vercel/Netlify
   * deployments, or when the auto-detected values are wrong.
   */
  vcs?: {
    /** vcs.provider.name — e.g. "github", "gitlab", "bitbucket". */
    providerName?: string;
    /** vcs.owner.name — repository owner / organization. */
    ownerName?: string;
    /** vcs.repository.name — short repository name (no owner prefix). */
    repositoryName?: string;
    /** vcs.repository.url.full — canonical repository URL. */
    repositoryUrlFull?: string;
    /** vcs.ref.head.name — branch or tag name the build was made from. */
    refHeadName?: string;
    /** vcs.ref.head.revision — commit SHA the build was made from. */
    refHeadRevision?: string;
    /** vcs.change.id — pull/merge request identifier (preview deploys). */
    changeId?: string;
  };

  /**
   * OTLP endpoints to which the generated telemetry should be sent to.
   */
  endpoint: Endpoint | Endpoint[];

  /**
   * Which instrumentations to enable. Defaults to undefined, which means all instrumentations.
   */
  enabledInstrumentations?: InstrumentationName[];

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
   * Configure trace context propagators for different URL patterns.
   * Each propagator defines which header type to send for matching URLs.
   */
  propagators?: PropagatorConfig[];
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
    | "urlAttributeScrubber"
    | "pageViewInstrumentation"
    | "enableTransportCompression"
  >
>;
