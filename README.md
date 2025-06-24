# Dash0 Web SDK

This sdk enables users of dash0's web monitoring features to instrument a website or single-page-application to capture
and transmit telemetry to dash0.

Features include:

- TODO fill this list

## Getting Started

The sdk is currently only distributed as an npm package, additional distribution formats will be added in the future.
Should you need a currently unavailable format, let us know by creating a github issue or via [support@dash0.com](mailto:support@dash0.com).

### Before you begin

You'll need a couple of prequesites before you can start:

- An active dash0 account. [Sign Up](https://www.dash0.com/sign-up)
- An [Auth Token](https://www.dash0.com/documentation/dash0/key-concepts/auth-tokens)
  Auth tokens for client monitoring will be public as part of your website, please make sure to:
  - Use a separate token, exclusively for web monitoring
  - Limit the dataset to the dataset you want to ingest to
  - Limit permissions to `Ingesting`
- The [Endpoint](https://www.dash0.com/documentation/dash0/key-concepts/endpoints) url for your dash0 region. You can find it via `Organization Settings > Endpoints > OTLP via HTTP`.

### Installation

#### Via package

- Add the sdk to your dependencies
  ```
  # npm
  npm install @dash0hq/sdk-web
  # yarn
  yarn add @dash0hq/sdk-web
  ```
- Initialize the sdk
  In order to initialize the sdk you'll need to call the `init` function at a convenient time in your applications lifecycle.
  Ideally this should happen as early as possible, as most instrumentations can only observe events after init has been called.

  ```js
  import { init } from "@dash0hq/sdk-web";

  init({
    serviceName: "my-website",
    endpoint: {
      // Replace this with the endpoint url identified during preparation
      url: "http://example.com",
      // Replace this with your auth token you created earlier
      // Ideally inject the value at build time to not commit the token to git, even if its effectively public
      authToken: "you-auth-token-goes-here",
    },
  });
  ```

## Configuration

The following configuration options are available, in order to customize the sdk's behaviour to your specific website.
These can all be passed via the sdk's `init` call.

### Backend Correlation

Backend Correlation for Http Requests is by default only enabled for endpoints that share the same origin as the website.

> [!NOTE]
> Misconfiguration of cross origin trace correlation can lead to request failures. Please make sure to carefully validate
> the configuration provided in the next steps

If you want to enable correlation for cross-origin requests you have to follow these steps:

- Make sure the endpoints respond to `OPTIONS` requests and include `traceparent` in their `Access-Control-Allow-Headers`
  response header.
- Include a regex matching the endpoint you want to enable in the [propagateTraceHeadersCorsURLs](#http-request-instrumentation) configuration option.

### Configuration auto detection

Certain configuration values can be auto-detected if using the module version of the sdk in combination with certain cloud providers.

#### Vercel

This currently also requires the use of nextJs

| Configuration Key | Source                                                                                                                                       |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| environment       | [NEXT_PUBLIC_VERCEL_ENV](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_ENV)               |
| deploymentName    | [NEXT_PUBLIC_VERCEL_TARGET_ENV](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_TARGET_ENV) |
| deploymentId      | [NEXT_PUBLIC_VERCEL_BRANCH_URL](https://vercel.com/docs/environment-variables/framework-environment-variables#NEXT_PUBLIC_VERCEL_BRANCH_URL) |

### Configuration Overview

#### General

- **Ignore URLs**<br>
  key: `ignoreUrls`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  An array of URL regular expression for which no data should be collected.
  These regular expressions are evaluated against the document, XMLHttpRequest, fetch and resource URLs.

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
  Id of the deployment, aps to the [deployment.id](https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/#deployment-id) otel attribute.
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
  The OTLP to which the generated telemtetry should be sent. Supports multiple endpoints in parallel if an array is provided.
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

#### Error Tracking

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
  Whether we should automatically wrap DOM event handlers added via addEventlistener for improved uncaught error tracking.
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

#### Http Request Instrumentation

- **Propagate Trace Header Cors URLs**<br>
  key: `propagateTraceHeadersCorsURLs`<br>
  type: `Array<RegExp>`<br>
  optional: `true`<br>
  default: `undefined`<br>
  An array of URL regular expressions for which trace context headers should be sent across origins by http client instrumentations.
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
  default: `3000`<br>
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

#### Page View Instrumentation

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
- **Ignore Url Part Changes**<br>
  key: `pageViewInstrumentation.ignoreParts`<br>
  type: `Array<"HASH" | "SEARCH">`<br>
  optional: `true`<br>
  default: `["HASH", "SEARCH"]`<br>
  Do not generate virtual page views when these url parts change.
  - "HASH" ignore changes to the urls hash / fragment
  - "SEARCH" ignore changes to the urls search / query parameters

## API

## Development

### Releases

This project follows the [Semantic Versioning](https://semver.org/) scheme `MAJOR.MINOR.PATH`.
In this means:

- `MAJOR` versions are released for significant changes in operation or backward incompatible API changes.
- `MINOR` versions add functionality in a backward compatible manner.
- `PATCH` versions include bug and security fixes which do not break backward compatibility.

We automatically release new versions of this package whenever a PR is merged to main and the ci is able to detect a
valid version increase from the merge commit. It uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
to calculate the version increase and to generate additional messaging such as changelogs.
Please make sure PR merge commits are formatted accordingly, not matching messages will create a PATCH release, but no
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

- Get a labmda test account
- Create a `.env` file based on `.env.example` and provide your lambda test credentials.
- Run the tests via `pnpm run test:e2e`

#### Why do tests run on ports 8010, 8011 and 8012?

We need multiple ports to properly test cors behaviour.
