import { AttributeValueType } from "./utils/otel";
import { AnyValue, InstrumentationScope, KeyValue, Resource } from "./types/otlp";
import { UrlAttributeScrubber } from "./attributes";
import type { ActionNameScrubber } from "./instrumentations/interactions/action-name";
import { identity } from "./utils";

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

/**
 * Fallback for `InteractionInstrumentationSettings.actionNameAttribute`. Lives
 * here rather than in the interactions module so that module can import it
 * without vars.ts needing a runtime import back (which would be a cycle).
 */
export const DEFAULT_ACTION_NAME_ATTRIBUTE = "data-dash0-action-name";

/**
 * Fallback for `InteractionInstrumentationSettings.maxEventsPerTenSeconds`, for
 * the same reason as the constant above. A quarter of the transport's
 * per-ten-second budget, so interaction volume leaves the other signals room.
 */
export const DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS = 32;

export type InteractionInstrumentationSettings = {
  /**
   * Whether the SDK should automatically capture click interactions.
   * Opt-in: disabled by default.
   * Also requires "@dash0/interactions" to be present in enabledInstrumentations
   * (or enabledInstrumentations left undefined).
   *
   * @default false
   */
  enabled?: boolean;

  /**
   * The element attribute the SDK checks first (on the clicked element or any
   * ancestor) when deriving a human-readable interaction name. Set this
   * attribute on interactive elements to fully control the captured name,
   * e.g. `<button data-dash0-action-name="Save Settings">`.
   *
   * @default "data-dash0-action-name"
   */
  actionNameAttribute?: string;

  /**
   * Opt in to capturing scroll interactions (one event per scroll burst,
   * with the net direction). Only applies when `enabled` is true.
   *
   * @default false
   */
  captureScrolls?: boolean;

  /**
   * Opt in to capturing key presses. Only navigation/activation keys
   * (Enter, Tab, Escape, Space, arrows, ...) are ever recorded; printable
   * characters never are. Only applies when `enabled` is true.
   *
   * @default false
   */
  captureKeyPresses?: boolean;

  /**
   * Opt in to capturing form-field changes. The field value is never read:
   * text fields report only the value length, selects only the selected
   * count, and password fields report neither. Only applies when `enabled`
   * is true.
   *
   * @default false
   */
  captureChanges?: boolean;

  /**
   * Maximum number of interaction events emitted per ten seconds.
   *
   * Interaction capture gets its own budget rather than competing for the
   * transport-wide one, so a burst of interactions can never evict spans,
   * errors, page views or web vitals. The ten-minute allowance is derived as 16x
   * this value, which keeps interactions at the same share of the transport
   * budget in both windows. Events over the budget are dropped at the source.
   *
   * Clamped to [1, 128] -- 128 being the transport's own per-ten-second
   * ceiling, at which point interactions may consume the entire budget. The
   * default leaves three quarters of it to the other signals.
   *
   * @default 32
   */
  maxEventsPerTenSeconds?: number;

  /**
   * Last-chance hook to replace or drop a derived interaction name. Runs as the
   * final step of name derivation, so it covers every place the name is
   * emitted: the `interaction.name` attribute, the human-readable event body,
   * and `user_interaction.name` on correlated HTTP spans.
   *
   * Receives the name the SDK would otherwise emit (already whitespace
   * normalized and truncated), how it was derived, and the interaction target.
   * Return a replacement, or an empty string to drop the name entirely. The
   * return value is normalized and truncated again.
   *
   * Only invoked when a name was actually derived -- it cannot invent a name
   * for an interaction the SDK could not name.
   *
   * Fails closed: if the scrubber throws or returns a non-string, the name is
   * dropped rather than emitted unscrubbed.
   *
   * @default undefined
   */
  actionNameScrubber?: ActionNameScrubber;
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
   */
  urlAttributeScrubber: UrlAttributeScrubber;

  pageViewInstrumentation: PageViewInstrumentationSettings;

  /**
   * Configures automatic user-interaction (click) instrumentation. Opt-in --
   * disabled by default. See {@link InteractionInstrumentationSettings}.
   */
  interactionInstrumentation: InteractionInstrumentationSettings;

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
  interactionInstrumentation: {
    enabled: false,
    actionNameAttribute: DEFAULT_ACTION_NAME_ATTRIBUTE,
    captureScrolls: false,
    captureKeyPresses: false,
    captureChanges: false,
    maxEventsPerTenSeconds: DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS,
  },
  enableTransportCompression: false,
  isSessionSampled: true,
};
