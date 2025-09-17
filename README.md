# Dash0 Web SDK

This SDK enables users of dash0's web monitoring features to instrument a website or single-page-application to capture
and transmit telemetry to dash0.

Features include:

- Page view instrumentation
- Navigation timing instrumentation
- HTTP request instrumentation
- Error tracking

## Getting Started

The SDK is currently only distributed as an npm package, additional distribution formats will be added in the future.
Should you need a currently unavailable format, let us know by creating a github issue or via [support@dash0.com](mailto:support@dash0.com).

### Before you begin

You'll need a couple of prerequisites before you can start:

- An active dash0 account. [Sign Up](https://www.dash0.com/sign-up)
- An [Auth Token](https://www.dash0.com/documentation/dash0/key-concepts/auth-tokens)
  Auth tokens for client monitoring will be public as part of your website, please make sure to:
  - Use a separate token, exclusively for web monitoring
  - Limit the dataset to the dataset you want to ingest to
  - Limit permissions to `Ingesting`
- The [Endpoint](https://www.dash0.com/documentation/dash0/key-concepts/endpoints) url for your dash0 region. You can find it via `Organization Settings > Endpoints > OTLP via HTTP`.

### Installation

#### Via package

- Add the SDK to your dependencies
  ```
  # npm
  npm install @dash0/sdk-web
  # yarn
  yarn add @dash0/sdk-web
  ```
- Initialize the sdk
  In order to initialize the sdk you'll need to call the `init` function at a convenient time in your applications lifecycle.
  Ideally this should happen as early as possible, as most instrumentations can only observe events after init has been called.

  ```js
  import { init } from "@dash0/sdk-web";

  init({
    serviceName: "my-website",
    endpoint: {
      // Replace this with the endpoint url identified during preparation
      url: "http://example.com",
      // Replace this with your auth token you created earlier
      // Ideally inject the value at build time to not commit the token to git, even if its effectively public
      authToken: "your-auth-token-goes-here",
    },
  });
  ```

## Configuration

The following configuration options are available, in order to customize the behaviour of the sdk.
These can all be passed via the sdk's `init` call.

### Backend Correlation

The SDK supports trace context propagation to correlate frontend requests with backend services. You can configure different header types for different endpoints using the new `propagators` configuration.

> [!NOTE]
> Misconfiguration of cross origin trace correlation can lead to request failures. Please make sure to carefully validate
> the configuration provided in the next steps

#### Propagators Configuration (Recommended)

Configure trace context propagators for different URL patterns:

```js
init({
  propagators: [
    // Send W3C traceparent headers to same-origin requests
    { type: "traceparent", match: ["sameorigin"] },
    // Send W3C traceparent headers to internal APIs
    { type: "traceparent", match: [/.*\/api\/internal.*/] },
    // Send AWS X-Ray headers to AWS services
    { type: "xray", match: [/.*\.amazonaws\.com.*/] },
    // Send both headers to specific endpoints
    { type: "traceparent", match: [/.*\/api\/special.*/] },
    { type: "xray", match: [/.*\/api\/special.*/] },
  ],
});
```

**Supported propagator types:**

- `"traceparent"`: W3C Trace Context headers for OpenTelemetry-compatible services
- `"xray"`: AWS X-Ray trace headers for AWS services

**Match patterns:**

- `RegExp`: Regular expressions to match against full URLs
- `"sameorigin"`: Special string that matches all same-origin requests

**Multiple Headers**: When multiple propagators match the same URL, both headers will be added to the request. This is useful when you need to support multiple tracing systems simultaneously.

#### Legacy Configuration (Deprecated)

The legacy `propagateTraceHeadersCorsURLs` configuration is still supported but deprecated:

- Make sure the endpoints respond to `OPTIONS` requests and include the appropriate headers in their `Access-Control-Allow-Headers` response header:
  - `traceparent` for W3C trace context
  - `X-Amzn-Trace-Id` for AWS X-Ray
- Include a regex matching the endpoint you want to enable in the [propagateTraceHeadersCorsURLs](#http-request-instrumentation) configuration option.

### Configuration auto detection

Certain configuration values can be auto-detected if using the module version of the SDK in combination with certain cloud providers.

#### Vercel

This currently also requires the use of Next.js

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
  Supported values: `'navigation' | 'web-vitals' | 'error' | 'fetch'`
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

#### OTLP Endpoint

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
    match: (RegExp | "sameorigin")[];
  };
  ```

  Example:

  ```js
  propagators: [
    // Use "sameorigin" for same-origin requests
    { type: "traceparent", match: ["sameorigin"] },
    // Use RegExp for specific URL patterns
    { type: "traceparent", match: [/.*\/api\/internal.*/] },
    { type: "xray", match: [/.*\.amazonaws\.com.*/] },
    // Multiple propagators can match the same URL to send both headers
    { type: "traceparent", match: [/.*\/api\/both.*/] },
    { type: "xray", match: [/.*\/api\/both.*/] },
  ];
  ```

  When multiple propagators match the same URL, both headers will be sent. Duplicate propagator types for the same URL are automatically deduplicated.
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
import { addSignalAttribute } from "@dash0/sdk-web";

addSignalAttribute("environment", "production");
addSignalAttribute("version", "1.2.3");
```

**Note:** If you need to ensure attributes are included with signals transmitted on initial page load, use the `additionalSignalAttributes` property in the `init()` call instead.

#### `removeSignalAttribute(name)`

Removes a previously added signal attribute.

**Parameters:**

- `name` (string): The attribute name to remove

**Example:**

```js
import { removeSignalAttribute } from "@dash0/sdk-web";

removeSignalAttribute("environment");
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
import { identify } from "@dash0/sdk-web";

identify("user123", {
  name: "johndoe",
  fullName: "John Doe",
  email: "john@example.com",
  roles: ["admin", "user"],
});
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
import { sendEvent } from "@dash0/sdk-web";

sendEvent("user_action", {
  data: "button_clicked",
  attributes: {
    buttonId: "submit-form",
    page: "/checkout",
  },
  severity: "INFO",
});
```

### Error Reporting

#### `reportError(error, opts)`

Manually reports an error to be tracked in telemetry.

**Parameters:**

- `error` (string | ErrorLike): Error message or error object
- `opts` (object, optional): Error reporting options
  - `componentStack` (string | null | undefined): Component stack trace for React errors

**Example:**

```js
import { reportError } from "@dash0/sdk-web";

// Report a string error
reportError("Something went wrong in user flow");

// Report an Error object
try {
  // Some operation
} catch (error) {
  reportError(error);
}

// Report with component stack (useful for React)
reportError(error, {
  componentStack: getComponentStack(),
});
```

### Session Management

#### `terminateSession()`

Manually terminates the current user session.

**Example:**

```js
import { terminateSession } from "@dash0/sdk-web";

// Terminate session on user logout
function handleLogout() {
  terminateSession();
  // Additional logout logic
}
```

**Note:** Sessions are automatically managed by the SDK based on inactivity and termination timeouts configured during initialization. Manual termination is typically only needed for explicit user logout scenarios.

### Internal Telemetry

#### `setActiveLogLevel(logLevel)`

Changes the active log level of this SDK. Defaults to `warn`.

**Example:**

```js
import { setActiveLogLevel } from "@dash0/sdk-web";

setActiveLogLevel("debug");
```

## Development

### Releases

This project follows the [Semantic Versioning](https://semver.org/) scheme `MAJOR.MINOR.PATH`.
In this means:

- `MAJOR` versions are released for significant changes in operation or backward incompatible API changes.
- `MINOR` versions add functionality in a backward compatible manner.
- `PATCH` versions include bug and security fixes which do not break backward compatibility.

We automatically release new versions of this package whenever a PR is merged to main and the CI is able to detect a
valid version increase from the merge commit. It uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
to calculate the version increase and to generate additional messaging such as changelogs.
Please make sure PR merge commits are formatted accordingly, non matching messages will create a PATCH release, but no
changelog entry.
Examples:

- A `PATCH` release:
  ```
  fix: Include missing user.name attribute
  ```
- A `MINOR` release:

  ```
  feat: Add instrumentation for fetch()

  The sdk now supports automatic instrumentation of the fetch api
  ```

- A `MAJOR` release:

  ```
  feat: Add version two of page-load instrumentation

  BREAKING CHANGE: This adds a new updated instrumentation for page-loads, it is no longer
  compatible with the previous version. For instructions on how to update see: https://example.com
  ```

  or:

  ```
  feat!: Add version two of page-load instrumentation

  This adds a new updated instrumentation for page-loads, it is no longer
  compatible with the previous version. For instructions on how to update see: https://example.com
  ```

- NO changelog entry, PATCH release:
  ```
  chore: Improve spelling of README
  ```

### E2E Tests

We run e2e tests via webdriverIO and lambda test.
They currently don't have a fully local setup, but tests can be executed locally targeting chrome headless via `pnpm run test:e2e:local`.

#### Setup

- Get a lambda test account
- Create a `.env` file based on `.env.example` and provide your lambda test credentials.
- Run the tests via `pnpm run test:e2e`

#### Why do tests run on ports 8010, 8011 and 8012?

We need multiple ports to properly test cors behaviour.
