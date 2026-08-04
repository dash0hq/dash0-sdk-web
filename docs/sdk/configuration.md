# Configuration

The following configuration options are available, in order to customize the behaviour of the Dash0 Web SDK.
These can all be passed via the Dash0 Web SDK's `init` call.

### Backend Correlation

The SDK supports trace context propagation to correlate frontend requests with backend services, for both `fetch`
and `XMLHttpRequest` (including libraries built on XHR, such as axios's default browser adapter). You can configure
different header types (`traceparent`, `X-Amzn-Trace-Id`) for different endpoints using the `propagators` configuration.

> Misconfiguration of cross origin trace correlation can lead to request failures. Please make sure to carefully
> validate the configuration provided in the next steps

#### Propagators Configuration (Recommended)

Configure trace context propagators for different URL patterns:

```js
init({
  propagators: [
    // W3C traceparent headers for internal APIs
    { type: "traceparent", match: [/.*\/api\/internal.*/] },
    // AWS X-Ray headers for AWS services
    { type: "xray", match: [/.*\.amazonaws\.com.*/] },
    // Send both headers to specific endpoints
    { type: "traceparent", match: [/.*\/api\/special.*/] },
    { type: "xray", match: [/.*\/api\/special.*/] },
  ],
});
```

**Supported propagator types:**

- `"traceparent"`: W3C TraceContext headers for OpenTelemetry-compatible services
- `"xray"`: AWS X-Ray trace headers for AWS services

**Same-origin requests**: All same-origin requests automatically receive `traceparent` headers plus headers for ALL
other configured propagator types, regardless of match patterns. This ensures consistent trace correlation within your
application.

**Match patterns for cross-origin requests:**

- `RegExp`: Regular expressions to match against full URLs

**Multiple Headers**: When multiple propagators match the same URL, both headers will be added to the request. This is
useful when you need to support multiple tracing systems simultaneously.

**Backend setup**

- Make sure the endpoints respond to `OPTIONS` requests and include the appropriate headers in their
  `Access-Control-Allow-Headers` response header:
  - `traceparent` for W3C trace context
  - `X-Amzn-Trace-Id` for AWS X-Ray

#### Legacy Configuration

> These configurations are deprecated

The legacy `propagateTraceHeadersCorsURLs` configuration is still supported but deprecated:

- Include a regex matching the endpoint you want to enable in
  the [propagateTraceHeadersCorsURLs](#http-request-instrumentation) configuration option.

### Configuration auto-detection

Certain configuration values can be auto-detected if using the module version of the Dash0 Web SDK in combination with
certain cloud providers.

#### Vercel — environment and deployment

The SDK detects `environment`, `deploymentName`, and `deploymentId` from Vercel's auto-prefixed system env vars. The same 9 framework prefixes listed under [VCS context](#vcs-version-control-context) are supported — the SDK picks up whichever variant the bundler substituted at build time.

| Configuration Key | Vercel system var (auto-prefixed per framework)                                                                                    |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| environment       | [`VERCEL_ENV`](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_ENV)               |
| deploymentName    | [`VERCEL_TARGET_ENV`](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_TARGET_ENV) |
| deploymentId      | [`VERCEL_BRANCH_URL`](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_BRANCH_URL) |

#### VCS (version control) context

The SDK auto-detects VCS context from the build environment and applies it as OpenTelemetry [`vcs.*`](https://opentelemetry.io/docs/specs/semconv/registry/attributes/vcs/) resource attributes on every signal. Pairing telemetry with the git commit, branch, and PR the build came from lets Dash0 Agent answer questions like _"which PR introduced this error?"_ out of the box.

**Detected attributes:**

| Resource attribute        | Vercel source                | Netlify source   |
| :------------------------ | :--------------------------- | :--------------- |
| `vcs.provider.name`       | `VERCEL_GIT_PROVIDER`        | derived from URL |
| `vcs.owner.name`          | `VERCEL_GIT_REPO_OWNER`      | derived from URL |
| `vcs.repository.name`     | `VERCEL_GIT_REPO_SLUG`       | derived from URL |
| `vcs.repository.url.full` | constructed from above       | `REPOSITORY_URL` |
| `vcs.ref.head.name`       | `VERCEL_GIT_COMMIT_REF`      | `BRANCH`         |
| `vcs.ref.head.revision`   | `VERCEL_GIT_COMMIT_SHA`      | `COMMIT_REF`     |
| `vcs.change.id`           | `VERCEL_GIT_PULL_REQUEST_ID` | `REVIEW_ID`      |

**Supported framework prefixes:**

The SDK enumerates the env vars above under every framework prefix the bundler exposes to the browser. On Vercel these prefixes are applied [automatically](https://vercel.com/docs/environment-variables/framework-environment-variables). On Netlify (and other CI/CD platforms that do not auto-prefix) you can expose the raw build env vars under your framework's prefix to get the same auto-detection — e.g. set `NEXT_PUBLIC_REPOSITORY_URL = $REPOSITORY_URL` in your Netlify build env, or the equivalent for your bundler.

| Framework                                | Prefix           |
| :--------------------------------------- | :--------------- |
| Next.js / Blitz.js                       | `NEXT_PUBLIC_`   |
| Nuxt 3                                   | `NUXT_PUBLIC_`   |
| Nuxt 2                                   | `NUXT_ENV_`      |
| Create React App                         | `REACT_APP_`     |
| Gatsby                                   | `GATSBY_`        |
| Vite / SvelteKit (v0) / SolidStart       | `VITE_`          |
| Astro / Hydrogen (v1) / modern SvelteKit | `PUBLIC_`        |
| Vue CLI                                  | `VUE_APP_`       |
| RedwoodJS                                | `REDWOOD_ENV_`   |
| Sanity Studio                            | `SANITY_STUDIO_` |

> **Bundler caveat for Vite-based setups:** Vite reads env vars via `import.meta.env.VITE_*` by default and does not substitute `process.env.VITE_*` in source code. The SDK relies on `process.env.VITE_*` literal accessors, so Vite users on Vercel get auto-detection (Vercel applies `VITE_` prefixing inside the build environment before Vite's substitution layer runs). Vite users on other platforms need to add a `define` entry or `process.env` polyfill to their `vite.config.ts` to substitute the relevant literals — or use the [`vcs`](#vcs-context) manual override.

**Detection precedence**, per attribute: `vcs` (manual override) → Vercel env var → Netlify env var → unset. Set [`vcs`](#vcs-context) to override any auto-detected value, or [`disableVcsDetection`](#vcs-context) to disable env-var reads entirely.

### Configuration Overview

#### General

- **Enabled Instrumentations**<br>
  key: `enabledInstrumentations`<br>
  type: `InstrumentationName[]`<br>
  optional: `true`<br>
  default: `undefined`<br>
  List of instrumentations to enable. Defaults to `undefined`, enabling all instrumentations.
  Supported values: `'@dash0/navigation' | '@dash0/web-vitals' | '@dash0/error' | '@dash0/fetch' | '@dash0/xhr' | '@dash0/interactions'`
  Please note that some dash0 features might not work as expected if instrumentations are disabled.

- **Ignore URLs**<br>
  key: `ignoreUrls`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  An array of URL regular expression for which no data should be collected.
  These regular expressions are evaluated against the document, XMLHttpRequest, fetch and resource URLs.

- ** URL Attribute Scrubber**<br>
  key: `urlAttributeScrubber`<br>
  type: `UrlAttributeScrubber`<br>
  optional: `true`<br>
  default: `(attributes) => attributes`
  Allows the application of a custom scrubbing function to url attributes before they are applied to signals.
  This is invoked for each url processed for inclusion in signal attributes. For example this applies both to
  `page.url.*`
  and `url.*` attribute namespaces.
  Sensitive parts of the url attributes should be replaced with `REDACTED`,
  avoid partially or fully dropping attributes to preserve telemetry quality.
  Note: basic auth credentials in urls are automatically redacted before this is invoked.

#### Website Details and Attributes

- **Service Name**<br>
  key: `serviceName`<br>
  type: `string`<br>
  optional: `false`<br>
  The logical name or your website, maps to
  the [service.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-name) otel
  attribute.
- **Service Namespace**<br>
  key: `serviceNamespace`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  A namespace for `serviceName`, maps to
  the [service.namespace](https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-namespace) otel
  attribute.
- **Service Version**<br>
  key: `serviceVersion`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  The current version of your website, maps to
  the [service.version](https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-version) otel
  attribute.
- **Environment**<br>
  key: `environment`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Name of the deployment environment, for example `staging`, or `production`. Maps to
  the [deployment.environment.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-environment-name)
  otel attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Deployment Name**<br>
  key: `deploymentName`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Name of the deployment, maps to
  the [deployment.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-name)
  otel attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Deployment Id**<br>
  key: `deploymentId`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Id of the deployment, maps to
  the [deployment.id](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-id) otel
  attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Additional Signal Attributes**<br>
  key: `additionalSignalAttributes`<br>
  type: `Record<string, AttributeValueType | AnyValue>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Allows the configuration of additional attributes to be included with any transmitted event.
  See [AttributeValueType](https://github.com/dash0hq/dash0-sdk-web/blob/main/src/utils/otel/attributes.ts#L4)
  and [AnyValue](https://github.com/dash0hq/dash0-sdk-web/blob/main/types/otlp.d.ts#L3) for detailed types.

#### VCS context

The SDK auto-detects VCS (version control) context from the build environment and applies it as `vcs.*` resource attributes — see [Configuration auto-detection > VCS](#vcs-version-control-context) for the full list of detected attributes and supported framework prefixes.

- **Disable VCS Detection**<br>
  key: `disableVcsDetection`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `false`<br>
  When `true`, the SDK does not read any build env vars to derive `vcs.*` attributes. Any values supplied via `vcs` are still applied — manual overrides always win.

- **VCS Manual Override**<br>
  key: `vcs`<br>
  type: `VcsAttributes`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Manually specify VCS context. Each provided field overrides the auto-detected value for that attribute. Use this for platforms without supported auto-detection, or when the auto-detected values are wrong. Supported fields:
  - `providerName` — maps to `vcs.provider.name`
  - `ownerName` — maps to `vcs.owner.name`
  - `repositoryName` — maps to `vcs.repository.name`
  - `repositoryUrlFull` — maps to `vcs.repository.url.full`
  - `refHeadName` — maps to `vcs.ref.head.name` (branch or tag)
  - `refHeadRevision` — maps to `vcs.ref.head.revision` (commit SHA)
  - `changeId` — maps to `vcs.change.id` (PR / MR identifier)

#### Telemetry Transmission

- **Endpoint**<br>
  key: `endpoint`<br>
  type: `Endpoint | Endpoint[]`<br>
  optional: `false`<br>
  The OTLP to which the generated telemetry should be sent. Supports multiple endpoints in parallel if an array is
  provided.
- **Endpoint URL**<br>
  key: `endpoint.url`<br>
  type: `string`<br>
  optional: `false`<br>
  The OTLP HTTP URL of the endpoint, not including the `/v1/*` part of the path
- **Endpoint Auth Token**<br>
  key: `endpoint.authToken`<br>
  type: `string`<br>
  optional: `false`<br>
  The auth token used for the endpoint. Will be placed into `Authorization: Bearer {auth_token}` header.
- **Endpoint Dataset**<br>
  key: `endpoint.dataset`<br>
  type: `string`<br>
  optional: `true`<br>
  Optionally specify what dataset should be placed into. Can also be configured within Dash0 through the auth token.
- **Enable Transport Compression**<br>
  key: `enableTransportCompression`<br>
  type: `boolean`<br>
  optional: `true`<br>
  Enables telemetry transport compression using gzip.
  EXPERIMENTAL - in rare cases causes Chrome to crash to use at your own risk.

#### Session Tracking

- **Session Sampling Rate**<br>
  key: `sessionSamplingRate`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `100`<br>
  The percentage of sessions for which telemetry data is recorded and transmitted.
  Must be a number between 0 and 100.

  - `0`: No sessions are recorded or transferred.
  - `100`: All sessions are recorded and transferred (default).
  - Any other value: That percentage of sessions are recorded and transferred.

  The sampling decision is deterministic per session ID, so a given session will always produce the same
  sampling outcome.

- **Session Inactivity Timeout**<br>
  key: `sessionInactivityTimeoutMillis`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `10800000` (3 hours)<br>
  The session inactivity timeout. Session inactivity is the maximum allowed time to pass between two page loads before
  the session is considered to be expired. The maximum value is the maximum session duration of 24 hours.
- **Session Termination Timeout**<br>
  key: `sessionTerminationTimeoutMillis`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `21600000` (6 hours)<br>
  The default session termination timeout. Session termination is the maximum allowed time to pass since session start
  before the session is considered to be expired.

#### Error tracking

- **Ignore Error Messages**<br>
  key: `ignoreErrorMessages`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  An array of error message regular expressions for which no data should be collected.
- **Wrap Event Handlers**<br>
  key: `wrapEventHandlers`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `true`<br>
  Whether we should automatically wrap DOM event handlers added via addEventListener for improved uncaught error
  tracking.
  This results in improved uncaught error tracking for cross-origin errors,
  but may have adverse effects on website performance and stability.
- **Wrap Timers**<br>
  key: `wrapTimers`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `true`<br>
  Whether we should automatically wrap timers added via setTimeout / setInterval for improved uncaught error tracking.
  This results in improved uncaught error tracking for cross-origin errors,
  but may have adverse effects on website performance and stability.

#### HTTP request instrumentation

- **Propagators**<br>
  key: `propagators`<br>
  type: `PropagatorConfig[]`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Configure trace context propagators for different URL patterns. Each propagator defines which header type to send for
  matching URLs.

  ```typescript
  type PropagatorConfig = {
    type: "traceparent" | "xray";
    match: RegExp[];
  };
  ```

  Example:

  ```js
  propagators: [
    // Use RegExp for specific cross-origin URL patterns
    { type: "traceparent", match: [/.*\/api\/internal.*/] },
    { type: "xray", match: [/.*\.amazonaws\.com.*/] },
    // Multiple propagators can match the same URL to send both headers
    { type: "traceparent", match: [/.*\/api\/both.*/] },
    { type: "xray", match: [/.*\/api\/both.*/] },
  ];
  ```

  **Same-origin behavior**: All same-origin requests automatically get `traceparent` headers plus headers for ALL other
  configured propagator types, regardless of match patterns.

  **Cross-origin behavior**: When multiple propagators match the same cross-origin URL, both headers will be sent.
  Duplicate propagator types for the same URL are automatically deduplicated.

  NOTE: Any cross origin endpoints allowed via this option need to include the appropriate headers in the
  `Access-Control-Allow-Headers`
  response header (`traceparent` for W3C, `X-Amzn-Trace-Id` for X-Ray). Misconfiguration will cause request failures!

- **Propagate Trace Header Cors URLs** ⚠️ **DEPRECATED**<br>
  key: `propagateTraceHeadersCorsURLs`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  **DEPRECATED: Use `propagators` instead.** An array of URL regular expressions for which trace context headers should
  be sent across origins by http client instrumentations.
  NOTE: Any cross origin endpoints allowed via this option need to include `traceparent` in the
  `Access-Control-Allow-Headers`
  response header. Misconfiguration will cause request failures!
- **Max Wait For Resource Timings**<br>
  key: `maxWaitForResourceTimingsMillis`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `10000`<br>
  How long to wait after an XMLHttpRequest or fetch request has finished for the retrieval of resource timing data.
  Performance timeline events are placed on the low priority task queue and therefore high values might be necessary.
- **Max Tolerance For Resource Timings**<br>
  key: `maxToleranceForResourceTimingsMillis`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `50`<br>
  The number of milliseconds of tolerance between resolution of a http request promise and the end time of
  performanceEntries
  applied when matching a request to its respective performance entry. A higher value might increase match frequency at
  the cost of potential incorrect matches. Matching is performed based on request timing and url.
- **Headers to Capture**<br>
  key: `headersToCapture`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  A set of regular expressions that will be matched against the HTTP request and response headers of requests made via
  the `XMLHttpRequest` and `fetch` instrumentations. Matching headers are transferred as span attributes
  (`http.request.header.<name>` and `http.response.header.<name>`).
  Matching is performed against the lowercased header name, so make sure your regular expressions match lowercase names
  (e.g. `/^x-my-header$/` instead of `/^X-My-Header$/`).

  NOTE: For cross-origin requests, browsers only expose response headers that the server lists in its
  `Access-Control-Expose-Headers` response header (besides the CORS-safelisted ones). Response headers that are not
  exposed this way are silently omitted from the span — the browser hides them without any error or log entry.

Both the `fetch` and `XMLHttpRequest` instrumentations report request outcomes on the span as follows:

**Responses**: `http.response.status_code` is always set when a response was received. Status codes 200-399 leave the
span status unset; all other status codes set the span status to error. For `fetch`, a response with status `0`
(e.g. an opaque response) additionally sets `error.type` to the response type.

**Errors and timeouts**: A failed `fetch` (rejected promise) sets the span status to error, records an `exception`
span event, and sets `error.type` to the exception name (typically `TypeError`); no `http.response.status_code` is
set. A failed `XMLHttpRequest` behaves the same, with `error.type` set to `error` for network errors and `timeout`
when `xhr.timeout` elapses (including synchronous requests, where `send()` throws).

**Cancellations**: Aborted requests (via `AbortController` for `fetch`, or `xhr.abort()`) are considered benign: the
span gets `dash0.web.request.cancelled` set to `true`, the span status stays unset, and no `error.type` or exception
event is recorded. If the response headers had already arrived (e.g. the request was aborted while the body was being
read), `http.response.status_code` is present as well. Note that `AbortSignal.timeout()` surfaces as a cancellation
for `fetch`, while an `XMLHttpRequest` timeout is an error — this asymmetry is inherent to the two APIs.

#### Page view instrumentation

- **Provide Page Metadata**<br>
  key: `pageViewInstrumentation.generateMetadata`<br>
  type: `(url: URL) => PageViewMeta | undefined`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Allows websites to dynamically provide page metadata based on the current url. Metadata may include the page title
  and a set of attributes. See [PageViewMeta](https://github.com/dash0hq/dash0-sdk-web/blob/main/src/vars.ts#L25) for
  detailed type information.
- **Track Virtual Page Views**<br>
  key: `pageViewInstrumentation.trackVirtualPageViews`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `true`<br>
  Whether the sdk should track virtual page views by instrumenting the history api.
  Only relevant for websites utilizing virtual navigation.
- **Track Url Part Changes**<br>
  key: `pageViewInstrumentation.includeParts`<br>
  type: `Array<"HASH" | "SEARCH">`<br>
  optional: `true`<br>
  default: `[]`<br>
  Additionally generate virtual page views when these url parts change.
  - "HASH" changes to the urls hash / fragment
  - "SEARCH" changes to the urls search / query parameters

#### Interaction instrumentation

Opt-in automatic capture of user interactions. Disabled by default --
set `interactionInstrumentation.enabled: true` to turn it on. When enabled, the SDK attaches capture-phase listeners
on `window` (no per-element wiring, no listener leakage) and emits one `browser.interaction` web event per
interaction, carrying a derived, privacy-conscious interaction name and a compact target-element selector.

Clicks are captured whenever the instrumentation is enabled. Scroll, key-press and form-change capture are each
_additionally_ opt-in via their own flags below.

- **Enable Interaction Instrumentation**<br>
  key: `interactionInstrumentation.enabled`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `false`<br>
  Whether the SDK should automatically capture user interactions. Enables click capture; the three capture flags
  below have no effect unless this is `true`. Also requires `'@dash0/interactions'` to be present in
  `enabledInstrumentations` when that option is explicitly set (it is included by default when
  `enabledInstrumentations` is left `undefined`).
- **Capture Scrolls**<br>
  key: `interactionInstrumentation.captureScrolls`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `false`<br>
  Emit one `scroll` interaction per scroll burst, with the burst's net direction in `interaction.direction`.
  Consecutive scroll events are coalesced; bursts smaller than a few pixels are discarded.
- **Capture Key Presses**<br>
  key: `interactionInstrumentation.captureKeyPresses`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `false`<br>
  Emit a `key_press` interaction for allow-listed navigation and activation keys only (e.g. `Enter`, `Tab`,
  `Escape`, arrow keys). Printable characters are never recorded -- see the privacy note below. Repeated presses
  of the same key on the same element are coalesced into one event carrying `interaction.repeat_count`; `Enter` is
  always emitted immediately.
- **Capture Changes**<br>
  key: `interactionInstrumentation.captureChanges`<br>
  type: `boolean`<br>
  optional: `true`<br>
  default: `false`<br>
  Emit a `change` interaction when a form control's value is committed. Reports only `interaction.value_length`
  for text fields and `interaction.selected_count` for selects -- never the value itself, and neither for
  password fields. Successive changes to the same control are coalesced into one event describing its latest
  state.
- **Max Events Per Ten Seconds**<br>
  key: `interactionInstrumentation.maxEventsPerTenSeconds`<br>
  type: `number`<br>
  optional: `true`<br>
  default: `32`<br>
  Maximum number of interaction events emitted per ten seconds. Interaction capture has its own budget rather
  than competing for the transport-wide one, so a burst of interactions can never displace spans, errors, page
  views or web vitals; events over the budget are dropped at the source. The ten-minute allowance is derived as
  16x this value, keeping interactions at the same share of the transport budget in both windows. Values are
  clamped to `[1, 128]`, `128` being the transport's own per-ten-second ceiling. Note that HTTP spans stay
  correlated to the interaction that caused them even when the interaction's own event is dropped.
- **Action Name Attribute**<br>
  key: `interactionInstrumentation.actionNameAttribute`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `"data-dash0-action-name"`<br>
  The element attribute the SDK checks first (on the clicked element or any of its ancestors) when deriving a
  human-readable interaction name. Set this attribute on interactive elements for full control over the captured
  name, e.g. `<button data-dash0-action-name="Save Settings">`.
- **Action Name Scrubber**<br>
  key: `interactionInstrumentation.actionNameScrubber`<br>
  type: `(name: string, source: ActionNameSource, target: Element) => string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Last-chance hook to replace or drop a derived interaction name. It runs as the final step of name derivation,
  so it covers every place the name is emitted: the `interaction.name` attribute, the human-readable event body,
  and `user_interaction.name` on correlated HTTP spans. It receives the name the SDK would otherwise emit
  (already whitespace-normalized and truncated), which phase derived it, and the interaction target; return a
  replacement, or an empty string to drop the name entirely. The return value is normalized and truncated again.
  It is only invoked when a name was actually derived, so it cannot invent a name for an interaction the SDK
  could not name. It **fails closed**: if the scrubber throws or returns a non-string, the name is dropped rather
  than emitted unscrubbed.

**Name derivation priority** (first match wins, walking from the clicked element up to 10 ancestors, stopping at
the first `FORM`, `BODY`, `HTML`, or `HEAD` boundary):

1. `custom_attribute` -- the configured `actionNameAttribute`, on the target or a qualifying ancestor.
2. `standard_attribute` -- attribute-derived names checked on the target then ancestors: for `button`/`submit`/`reset`
   inputs, `.value`; then `aria-label`, `aria-labelledby` (resolved via the privacy-aware label text of the
   referenced element(s) -- a reference to, or wrapping, a form control contributes nothing), `alt`, `title`, or
   `placeholder`.
3. `text_content` -- the label text of clickable-tag elements (`BUTTON`, `LABEL`, `A`, or `role="button"`) found
   while walking up from the target. This is _not_ `textContent`: the collector never descends into a nested
   `input`, `textarea`, `select`, `option`, `output`, `script`, `style`, `noscript`, or `contenteditable` element,
   because a `<label>` or `<button>` normally _wraps_ its control, so its raw `textContent` would contain the
   user's entered value. `<label>Notes <textarea>my private note</textarea></label>` therefore yields `Notes`,
   never the note -- whether the click landed on the label or on the textarea inside it. Shadow roots are never
   traversed. A click landing on a plain container (a layout `<div>`, `<footer>`, …) with no clickable element in
   its ancestor path deliberately yields a blank name plus target metadata, rather than the container's entire
   visible text.
4. `blank` -- an empty name, if nothing above matched.

Attribute-derived sources always outrank text: the full phase order is custom attribute → standard attributes
(walk) → text content (walk) → blank. Each captured event's `interaction.name_source` attribute reflects which
phase produced the name.

**Privacy defaults.** The SDK never reads the value of `password`, `text`, `textarea`, or `select` elements --
only `button`/`submit`/`reset` inputs expose their value for name derivation -- and it never reads text from a
form control, `<output>`, `contenteditable` region, or `<script>`/`<style>` **nested anywhere inside** the element
it names, including via `aria-labelledby`. Key-press capture records only allow-listed control keys, never
printable characters. Change capture records value length and selected count, never values. Derived names are
whitespace-normalized and truncated to 100 characters (plus a ` [...]` marker when truncation occurred); the text
scan itself is bounded to 1024 characters and 1000 DOM nodes. The target-element selector is independently capped
at 128 characters. None of these limits is configurable -- use `actionNameScrubber` for cases the heuristics
cannot know about, such as a `title` or `alt` attribute your application interpolates user data into.

**Emitted attributes.** Every `browser.interaction` event carries `interaction.id`, `interaction.type` (`click`,
`scroll`, `key_press`, or `change`), `interaction.name`, `interaction.name_source`, `interaction.target.tag`,
`interaction.target.selector`, and `interaction.target.id` when the element has one. Type-specific attributes:
`interaction.direction` (scroll), `interaction.key` plus `interaction.repeat_count` (key press), and
`interaction.value_length` / `interaction.selected_count` (change). The event body is a human-readable string such as
`Click "Save Settings" on /settings`; treat the attributes, not the body, as the stable contract. The path in the
body is the same scrubbed value as the event's `page.url.path` attribute, so a configured `urlAttributeScrubber`
applies to it too -- if the scrubber drops `url.path`, the body omits the ` on <path>` suffix entirely rather than
falling back to the raw location.

**One event per gesture.** Scroll, key-press and change capture coalesce bursts of DOM events into a single
interaction event, finalized 300 ms after the last event in the burst -- one event per scroll burst, per run of
presses of the same key, and per run of changes to the same control. A burst is also finalized immediately when
the user moves on (a different key, a different control) and when the page is being unloaded, so the last
interaction before a navigation is not lost. Coalesced events are timestamped when the burst _started_, and every
request attributed during a burst shares the one correlation id the burst emits.

Clicking a `<label>` makes the browser fire a second click at the label's control, so a
single user action reaches the SDK twice. Only the click the user actually made is reported: the forwarded
duplicate is dropped, for both `<label>Text <input></label>` and `<label for="…">`. This means
`interaction.target.tag` / `.selector` / `.id` describe the label (or the element inside it that was clicked)
rather than the control it activates -- enable `captureChanges` if you also need a record naming the control whose
value changed.

**Click-to-request correlation.** A click registers a short-lived (2 second) active interaction before the page's
own handlers run. Any `fetch` or `XMLHttpRequest` span started inside that window is stamped with
`user_interaction.id` and, when a name was derived, `user_interaction.name` -- joining a user action to the HTTP
requests it triggered. Join a span to its interaction event by matching the span's `user_interaction.id` against
the event's `interaction.id`. Key presses open the window only for activation keys (`Enter` and `Space`).

Note: capturing interaction events requires both `interactionInstrumentation.enabled: true` **and**
`'@dash0/interactions'` present in `enabledInstrumentations` if that option is explicitly set to a non-default
list -- either gate alone is not sufficient.

```ts
init({
  serviceName: "my-website",
  endpoint: { url: "{OTLP via HTTP endpoint}", authToken: "{authToken}" },
  interactionInstrumentation: {
    enabled: true,
    // Optional: redact anything the derivation heuristics cannot know about.
    actionNameScrubber: (name) => name.replace(/[^\s@]+@[^\s@]+/g, "[email]"),
  },
});
```
