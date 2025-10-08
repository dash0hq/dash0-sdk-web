import { AttributeValueType } from "../utils/otel";
import { AnyValue } from "./otlp";
import { Endpoint, Vars, PropagatorConfig } from "../vars";

export type InstrumentationName = "@dash0/navigation" | "@dash0/web-vitals" | "@dash0/error" | "@dash0/fetch";

export type InitOptions = {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  deploymentName?: string;
  deploymentId?: string;

  /**
   * Additional attributes to include with transmitted signals
   */
  additionalSignalAttributes?: Record<string, AttributeValueType | AnyValue>;

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
    | "maxResponseBodySize"
    | "pageViewInstrumentation"
  >
>;
