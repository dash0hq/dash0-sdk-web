# Installation

The SDK is currently distributed as an NPM package.
We are considering adding more distribution formats in the future.
Should you need a currently unavailable format, let us know by [creating a GitHub issue](https://github.com/dash0hq/dash0-sdk-web/issues) or via [support@dash0.com](mailto:support@dash0.com).

## Before you begin

You'll need the following before you can start with the Dash0 Web SDK:

- An active Dash0 account. [Sign Up](https://www.dash0.com/sign-up)
- An [Auth Token](https://www.dash0.com/documentation/dash0/key-concepts/auth-tokens); auth tokens for client monitoring will be public as part of your website, please make sure to:
  - Use a separate token, exclusively for website monitoring; if you want to monitor multiple websites, it is best to use a dedicated token for each
  - Limit the dataset permissions on the auth token to the dataset you want to ingest Website Monitoring data with
  - Limit permissions on the auth token to `Ingesting`
- The [Endpoint](https://www.dash0.com/documentation/dash0/key-concepts/endpoints) url for your dash0 region. You can find it via `Organization Settings > Endpoints > OTLP via HTTP`.

## Setup

### Using Modules

1. Add the SDK to your dependencies

```sh
# npm
npm install @dash0/sdk-web
# yarn
yarn add @dash0/sdk-web
```

2. Initialize the SDK in your code: you'll need to call the `init` function at a convenient time in your applications lifecycle.
   Ideally this should happen as early as possible in the web page intialization, as most instrumentations shipped by the SDK can only observe events after init has been called.

   ```js
   import { init } from "@dash0/sdk-web";

   init({
     serviceName: "my-website",
     endpoint: {
       // Replace this with the endpoint url identified during preparation
       url: "REPLACE THIS",
       // Replace this with your auth token you created earlier
       // Ideally, you will inject the value at build time in order not commit the token to git,
       // even if its effectively public in the HTML you ship to the end user's browser
       authToken: "REPLACE THIS",
     },
   });
   ```

### Using script tags

The sdk can also injected via script tags in cases where a module build is not being used.
Simply copy the following snippet to your html file and adjust the configuration as needed.
You can choose to always load the latest script or pin the script to a specific version (see example below).
Loading a specific version usually also improves loading performance of the script.

```html
<script>
  (function (d, a, s, h, z, e, r, o) {
    d[a] ||
      ((z = d[a] =
        function () {
          h.push(arguments);
        }),
      (z._t = new Date()),
      (z._v = 1),
      (h = z._q = []));
  })(window, "dash0");
  dash0("init", {
    serviceName: "my-website",
    endpoint: {
      // Replace this with the endpoint url identified during preparation
      url: "REPLACE THIS",
      // Replace this with your auth token you created earlier
      // Ideally, you will inject the value at build time in order not commit the token to git,
      // even if its effectively public in the HTML you ship to the end user's browser
      authToken: "REPLACE THIS",
    },
  });
</script>
<!--Latest-->
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web/dist/dash0.iife.js"></script>
<!--Or pin a specific version-->
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web@0.18.1/dist/dash0.iife.js"></script>
```

#### Api usage

Please note that the api for the IIFE build of the sdk is slightly different from the module build.
All apis can be called via a global `dash0` function. The following call `addSignalAttribute("the_answer", 42)` for example
would called like this for the IIFE build: `dash0("addSignalAttribute", "the_answer", 42)`.

#### Content Security and Integrity

Depending on the content security policy of your site you might need to additionally allow loading of the script.
You can use `Content-Security-Policy: script-src 'self' https://unpkg.com` to allow all scripts from unpkg, or if using a specific
version of the sdk `Content-Security-Policy: script-src 'self' https://unpkg.com/@dash0/sdk-web@0.18.1/dist/dash0.iife.js`
to only allow the specific file to be loaded.

If you want to further restrict the policy to guard against changes in the hosted script,
you can allow only the hash of the sdk version you'd like to integrate, like so:
`Content-Security-Policy: script-src 'self' 'sha256-replace-me'`
The current hash can be viewed by appending `?meta` to the unpkg url you are loading the script from and removing the file name: https://unpkg.com/@dash0/sdk-web@0.18.1/dist?meta
Then find the `dash0.iife.js` file and copy its integrity value.

Additionally you might need to allow the script to connect to your configured endpoint url like so:
`Content-Security-Policy: connect-src 'self' YOUR_ENDPOINT_URL_HERE`

## Configuration

The following configuration options are available, in order to customize the behaviour of the sdk.
These can all be passed via the sdk's `init` call.

### Backend Correlation

The SDK supports trace context propagation to correlate frontend requests with backend services. You can configure different header types (`traceparent`, `X-Amzn-Trace-Id`) for different endpoints using the `propagators` configuration.

> Misconfiguration of cross origin trace correlation can lead to request failures. Please make sure to carefully validate the configuration provided in the next steps

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

**Same-origin requests**: All same-origin requests automatically receive `traceparent` headers plus headers for ALL other configured propagator types, regardless of match patterns. This ensures consistent trace correlation within your application.

**Match patterns for cross-origin requests:**

- `RegExp`: Regular expressions to match against full URLs

**Multiple Headers**: When multiple propagators match the same URL, both headers will be added to the request. This is useful when you need to support multiple tracing systems simultaneously.

**Backend setup**

- Make sure the endpoints respond to `OPTIONS` requests and include the appropriate headers in their `Access-Control-Allow-Headers` response header:
  - `traceparent` for W3C trace context
  - `X-Amzn-Trace-Id` for AWS X-Ray

#### Legacy Configuration

> These configurations are deprecated

The legacy `propagateTraceHeadersCorsURLs` configuration is still supported but deprecated:

- Include a regex matching the endpoint you want to enable in the [propagateTraceHeadersCorsURLs](#http-request-instrumentation) configuration option.

### Configuration auto-detection

Certain configuration values can be auto-detected if using the module version of the SDK in combination with certain cloud providers.

#### Vercel

These functionalities requires the use of Next.js:

| Configuration Key | Source                                                                                                                                       |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| environment       | [NEXT_PUBLIC_VERCEL_ENV](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_ENV)               |
| deploymentName    | [NEXT_PUBLIC_VERCEL_TARGET_ENV](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_TARGET_ENV) |
| deploymentId      | [NEXT_PUBLIC_VERCEL_BRANCH_URL](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_BRANCH_URL) |

### Configuration Overview

#### General

- **Enabled Instrumentations**<br>
  key: `enabledInstrumentations`<br>
  type: `InstrumentationName[]`<br>
  optional: `true`<br>
  default: `undefined`<br>
  List of instrumentations to enable. Defaults to `undefined`, enabling all instrumentations.
  Supported values: `'@dash0/navigation' | '@dash0/web-vitals' | '@dash0/error' | '@dash0/fetch'`
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
  This is invoked for each url processed for inclusion in signal attributes. For example this applies both to `page.url.*`
  and `url.*` attribute namespaces.
  Sensitive parts of the url attributes should be replaced with `REDACTED`,
  avoid partially or fully dropping attributes to preserve telemetry quality.
  Note: basic auth credentials in urls are automatically redacted before this is invoked.

#### Website Details and Attributes

- **Service Name**<br>
  key: `serviceName`<br>
  type: `string`<br>
  optional: `false`<br>
  The logical name or your website, maps to the [service.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-name) otel attribute.
- **Service Version**<br>
  key: `serviceVersion`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  The current version of your website, maps to the [service.version](https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-version) otel attribute.
- **Environment**<br>
  key: `environment`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Name of the deployment environment, for example `staging`, or `production`. Maps to the [deployment.environment.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-environment-name) otel attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Deployment Name**<br>
  key: `deploymentName`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Name of the deployment, maps to the [deployment.name](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-name) otel attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Deployment Id**<br>
  key: `deploymentId`<br>
  type: `string`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Id of the deployment, maps to the [deployment.id](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-id) otel attribute.
  This value is [auto detected](#configuration-auto-detection) in certain build environments.
- **Additional Signal Attributes**<br>
  key: `additionalSignalAttributes`<br>
  type: `Record<string, AttributeValueType | AnyValue>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  Allows the configuration of additional attributes to be included with any transmitted event.
  See [AttributeValueType](https://github.com/dash0hq/dash0-sdk-web/blob/main/src/utils/otel/attributes.ts#L4) and [AnyValue](https://github.com/dash0hq/dash0-sdk-web/blob/main/types/otlp.d.ts#L3) for detailed types.

#### Telemetry Transmission

- **Endpoint**<br>
  key: `endpoint`<br>
  type: `Endpoint | Endpoint[]`<br>
  optional: `false`<br>
  The OTLP to which the generated telemetry should be sent. Supports multiple endpoints in parallel if an array is provided.
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
  Whether we should automatically wrap DOM event handlers added via addEventListener for improved uncaught error tracking.
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
  Configure trace context propagators for different URL patterns. Each propagator defines which header type to send for matching URLs.

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

  **Same-origin behavior**: All same-origin requests automatically get `traceparent` headers plus headers for ALL other configured propagator types, regardless of match patterns.

  **Cross-origin behavior**: When multiple propagators match the same cross-origin URL, both headers will be sent. Duplicate propagator types for the same URL are automatically deduplicated.

  NOTE: Any cross origin endpoints allowed via this option need to include the appropriate headers in the `Access-Control-Allow-Headers`
  response header (`traceparent` for W3C, `X-Amzn-Trace-Id` for X-Ray). Misconfiguration will cause request failures!

- **Propagate Trace Header Cors URLs** ⚠️ **DEPRECATED**<br>
  key: `propagateTraceHeadersCorsURLs`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  **DEPRECATED: Use `propagators` instead.** An array of URL regular expressions for which trace context headers should be sent across origins by http client instrumentations.
  NOTE: Any cross origin endpoints allowed via this option need to include `traceparent` in the `Access-Control-Allow-Headers`
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
  The number of milliseconds of tolerance between resolution of a http request promise and the end time of performanceEntries
  applied when matching a request to its respective performance entry. A higher value might increase match frequency at
  the cost of potential incorrect matches. Matching is performed based on request timing and url.
- **Headers to Capture**<br>
  key: `headersToCapture`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  A set of regular expressions that will be matched against HTTP request headers,
  to be captured in `XMLHttpRequest` and `fetch` Instrumentations. These headers will be transferred as span attributes.

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

## API

The SDK provides several API functions to help you customize telemetry collection and add contextual information to your signals.

### Signal attributes

Functions for managing custom attributes that are included with all signals.

#### `addSignalAttribute(name, value)`

Adds a signal attribute to be transmitted with every signal.

**Parameters:**

- `name` (string): The attribute name
- `value` (AttributeValueType | AnyValue): The attribute value

**Example:**

```js
// Module
import { addSignalAttribute } from "@dash0/sdk-web";

addSignalAttribute("environment", "production");
addSignalAttribute("version", "1.2.3");

// Script
dash0("addSignalAttribute", "environment", "production");
```

**Note:** If you need to ensure attributes are included with signals transmitted on initial page load, use the `additionalSignalAttributes` property in the `init()` call instead.

#### `removeSignalAttribute(name)`

Removes a previously added signal attribute.

**Parameters:**

- `name` (string): The attribute name to remove

**Example:**

```js
// Module
import { removeSignalAttribute } from "@dash0/sdk-web";

removeSignalAttribute("environment");

// Script
dash0("removeSignalAttribute", "environment");
```

### User identification

#### `identify(id, opts)`

Associates user information with telemetry signals.
See [OTEL User Attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/user/) for the matching attributes

**Parameters:**

- `id` (string, optional): User identifier
- `opts` (object, optional): Additional user information
  - `name` (string, optional): Short name or login/username of the user
  - `fullName` (string, optional): User's full name
  - `email` (string, optional): User email address
  - `hash` (string, optional): Unique user hash to correlate information for a user in anonymized form.
  - `roles` (string[], optional): User roles

**Example:**

```js
// Module
import { identify } from "@dash0/sdk-web";

identify("user123", {
  name: "johndoe",
  fullName: "John Doe",
  email: "john@example.com",
  roles: ["admin", "user"],
});

// Script
dash0("identify", "user123", { name: "johndoe" });
```

### Custom Events

#### `sendEvent(name, opts)`

Sends a custom event with optional data and attributes.
Event name cannot be one of the event names internally used by the SDK. See [Event Names](https://github.com/dash0hq/dash0-sdk-web/blob/main/src/semantic-conventions.ts#L50)

**Parameters:**

- `name` (string): Event name
- `opts` (object, optional): Event options
  - `title` (string, optional): Human readable title for the event. Should summarize the event in a single short sentence.
  - `timestamp` (number | Date, optional): Event timestamp
  - `data` (AttributeValueType | AnyValue, optional): Event data
  - `attributes` (Record<string, AttributeValueType | AnyValue>, optional): Event attributes
  - `severity` (LOG_SEVERITY_TEXT, optional): Log severity level

**Example:**

```js
// Module
import { sendEvent } from "@dash0/sdk-web";

sendEvent("user_action", {
  data: "button_clicked",
  attributes: {
    buttonId: "submit-form",
    page: "/checkout",
  },
  severity: "INFO",
});

// Script
dash0("sendEvent", "user_action", { data: "button_clicked", severity: "INFO" });
```

### Error Reporting

#### `reportError(error, opts)`

Manually reports an error to be tracked in telemetry.

**Parameters:**

- `error` (string | ErrorLike): Error message or error object
- `opts` (object, optional): Error reporting options
  - `componentStack` (string | null | undefined, optional): Component stack trace for React errors
  - `attributes` (Record<string, AttributeValueType | AnyValue>, optional): Additional attributes to include with the error report

**Example:**

```js
// Module
import { reportError } from "@dash0/sdk-web";

// Report a string error
reportError("Something went wrong in user flow");

// Report an Error object
try {
  // Some operation
} catch (error) {
  reportError(error);
}

reportError(error, {
  // Report with component stack (useful for React)
  componentStack: getComponentStack(),
  // Additional attributes
  attributes: {
    "user.id": "user123",
  },
});

// Script
dash0("reportError", "Something went wrong in user flow");
```

### Session Management

#### `terminateSession()`

Manually terminates the current user session.

**Example:**

```js
// Module
import { terminateSession } from "@dash0/sdk-web";

// Terminate session on user logout
function handleLogout() {
  terminateSession();
  // Additional logout logic
}

// Script
dash0("terminateSession");
```

**Note:** Sessions are automatically managed by the SDK based on inactivity and termination timeouts configured during initialization. Manual termination is typically only needed for explicit user logout scenarios.

### Internal Telemetry

#### `setActiveLogLevel(logLevel)`

Changes the active log level of this SDK. Defaults to `warn`.

**Example:**

```js
// Module
import { setActiveLogLevel } from "@dash0/sdk-web";

setActiveLogLevel("debug");

// Script
dash0("setActiveLogLevel", "debug");
```
