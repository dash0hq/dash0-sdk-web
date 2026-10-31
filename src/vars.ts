import { AttributeValueType } from "./utils/otel";
import { AnyValue, InstrumentationScope, KeyValue, Resource } from "./types/otlp";
import { UrlAttributeScrubber } from "./attributes";
import { identity } from "./utils";
import { SessionRecordingSettings } from "./types/session-recording";
import { FrustrationSignalSettings } from "./types/frustration";
import { ProfilingSettings } from "./types/profiling";

export type PropagatorType = "traceparent" | "xray";

export type PropagatorConfig = {
  type: PropagatorType;
  match: RegExp[];
};

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
   * the document, XMLHttpRequest and fetch URLs. While the document URL
   * matches, no page views, navigation timings, web vitals, errors or
   * rage clicks are sent, and no session recording is started.
   * XMLHttpRequest and fetch requests made from an ignored page are still
   * recorded, unless the request URL matches too. Signals from an ignored
   * page have no page URL attributes. Matching referrers are not sent. In
   * error messages and stack traces, the page, referrer, document and
   * request URLs are redacted when they match. Other URLs are not changed.
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
   * Configure trace context propagators for different URL patterns.
   * Each propagator defines which header type to send for matching URLs.
   */
  propagators?: PropagatorConfig[];

  /**
   * An array of URL regular expressions
   * for which trace context headers should be sent across origins by http client instrumentations.
   * @deprecated Use propagators instead
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

  /**
   * Allows the application of a custom scrubbing function to url attributes before they are applied to signals.
   * This is invoked for each url processed for inclusion in signal attributes. For example this applies both to `page.url.*`
   * and `url.*` attribute namespaces.
   * Sensitive parts of the url attributes should be replaced with `REDACTED`,
   * avoid partially or fully dropping attributes to preserve telemetry quality.
   * Note: basic auth credentials in urls are automatically redacted before this is invoked.
   * The scrubbed `url.full` value is also used where a url is reported as plain text, e.g. the navigation timing name,
   * the page view referrer, HTTP request failure messages and error stack traces. If the scrubber changes or removes
   * any other url attribute but returns `url.full` unchanged, `url.full` is rebuilt from the scrubbed parts.
   */
  urlAttributeScrubber: UrlAttributeScrubber;

  pageViewInstrumentation: PageViewInstrumentationSettings;

  /**
   * Session recording (replay) settings. Recording only starts when a recorder is provided, either through
   * `sessionRecording.recorder`, `startSessionRecording(recorder)`, or the `dash0-session-recording.iife.js` script.
   */
  sessionRecording: SessionRecordingSettings;

  /**
   * Thresholds for the frustration signals the SDK derives from user interaction, currently
   * rage clicks. Detection runs independently of session recording; when a recording is running,
   * the emitted event carries its recording id so the replay can be opened at that moment.
   */
  frustrationSignals: FrustrationSignalSettings;

  /**
   * JS Self-Profiling settings. Profiling runs only when `@dash0/profiling` is listed in
   * `enabledInstrumentations` and an encoder from `@dash0/sdk-web/profiling` is provided.
   */
  profiling: ProfilingSettings;

  /**
   * Enables telemetry transport compression using gzip.
   * experimental - in rare cases causes Chrome to crash to use at your own risk.
   */
  enableTransportCompression: boolean;

  /**
   * Whether the current session is sampled in (true) or out (false).
   * Determined at init time based on sessionSamplingRate and the session ID.
   */
  isSessionSampled: boolean;
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
  urlAttributeScrubber: identity,
  pageViewInstrumentation: {
    trackVirtualPageViews: true,
    includeParts: [],
  },
  sessionRecording: {
    samplingRate: 100,
    maskAllInputs: true,
    maskTextClass: "dash0-mask",
    blockClass: "dash0-block",
    recordCanvas: false,
    collectFonts: false,
    chunkMaxBytes: 48000,
    chunkMaxMillis: 5000,
    checkoutEveryNms: 300000,
  },
  frustrationSignals: {
    rageClick: {
      minClicks: 3,
      windowMillis: 1000,
      radiusPixels: 30,
    },
  },
  profiling: {
    sampleRate: 10,
    sampleIntervalMs: 10,
    chunkDurationMs: 15000,
  },
  enableTransportCompression: false,
  isSessionSampled: true,
};
