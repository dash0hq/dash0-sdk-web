import { AttributeValueType } from "./utils/otel";
import { AnyValue, InstrumentationScope, KeyValue, Resource } from "./types/otlp";

export type Endpoint = {
  /**
   * OTLP HTTP URL excluding the /v1/* prefix
   */
  url: string;

  /**
   * Will be placed into `Authorization: Bearer {auth_token}` header. Has the form
   * `auth_abc123`.
   */
  authToken: string;

  /**
   * Optionally specify what dataset should be placed into. Can also be configured within Dash0
   * through the auth token.
   */
  dataset?: string;
};

export type PageViewMeta = {
  /**
   * Defaults to document.title
   */
  title?: string;
  attributes?: Record<string, AttributeValueType | AnyValue>;
};

export type PageViewInstrumentationSettings = {
  /**
   * Allows the selection of custom page metadata, falls back to default behaviour if undefined is returned.
   */
  generateMetadata?: (url: URL) => PageViewMeta | undefined;

  /**
   * Whether the sdk should track virtual page views by instrumenting the history api.
   * Only relevant for websites utilizing virtual navigation.
   * Defaults to true.
   */
  trackVirtualPageViews?: boolean;

  /**
   * Additionally generate virtual page views when these url parts change.
   * - "HASH" include changes to the urls hash / fragment
   * - "SEARCH" include changes to the urls search / query parameters
   */
  includeParts?: Array<"HASH" | "SEARCH">;
};

export type Vars = {
  /**
   * Telemetry endpoints to which the generated telemetry should be sent
   */
  endpoints: Endpoint[];

  /**
   * OpenTelemetry resource used for all the telemetry we emit.
   */
  resource: Resource;

  /**
   * OpenTelemetry scope used for all the telemetry we emit.
   */
  scope: InstrumentationScope;

  /**
   * Attributes that are supposed to be added to all outgoing signals
   * at the time they are **added** to the transport layer.
   */
  signalAttributes: KeyValue[];

  /**
   * An array of URL regular expression for which no data should be
   * collected. These regular expressions are evaluated against
   * the document, XMLHttpRequest, fetch and resource URLs.
   */
  ignoreUrls: RegExp[];

  /**
   * An array of error message regular expressions for which no data
   * should be collected.
   */
  ignoreErrorMessages: RegExp[];

  /**
   * Whether we should automatically wrap DOM event handlers
   * added via addEventlistener for improved uncaught error tracking.
   * This results in improved uncaught error tracking for cross-origin
   * errors, but may have adverse effects on website performance and
   * stability.
   *
   * @default true
   */
  wrapEventHandlers: boolean;

  /**
   * Whether we should automatically wrap timers
   * added via setTimeout / setInterval for improved uncaught error tracking.
   * This results in improved uncaught error tracking for cross-origin
   * errors, but may have adverse effects on website performance and
   * stability.
   *
   * @default true
   */
  wrapTimers: boolean;

  /**
   * An array of URL regular expressions
   * for which trace context headers should be sent across origins by http client instrumentations.
   */
  propagateTraceHeadersCorsURLs: RegExp[];

  /**
   * How long to wait after an XMLHttpRequest or fetch request has finished
   * for the retrieval of resource timing data. Performance timeline events
   * are placed on the low priority task queue and therefore high values
   * might be necessary.
   *
   * @default 10000
   */
  maxWaitForResourceTimingsMillis: number;

  /**
   * The number of milliseconds of tolerance between resolution of a http request promise and the end time of performanceEntries
   * applied when matching a request to its respective performance entry. A higher value might increase match frequency at
   * the cost of potential incorrect matches. Matching is performed based on request timing and url.
   *
   * @default 50
   */
  maxToleranceForResourceTimingsMillis: number;

  /**
   * A set of regular expressions that will be matched against HTTP request headers to be
   * captured in `XMLHttpRequest` and `fetch` Instrumentations.
   * These headers will be transferred as span attributes
   */
  headersToCapture: RegExp[];

  pageViewInstrumentation: PageViewInstrumentationSettings;
};

export const vars: Vars = {
  endpoints: [],
  resource: {
    attributes: [],
  },
  scope: {
    name: "dash0-web-sdk",
    version: __sdkVersion,
    attributes: [],
  },
  signalAttributes: [],
  ignoreUrls: [],
  ignoreErrorMessages: [],
  wrapEventHandlers: true,
  wrapTimers: true,
  propagateTraceHeadersCorsURLs: [],
  maxWaitForResourceTimingsMillis: 10000,
  maxToleranceForResourceTimingsMillis: 50,
  headersToCapture: [],
  pageViewInstrumentation: {
    trackVirtualPageViews: true,
    includeParts: [],
  },
};
