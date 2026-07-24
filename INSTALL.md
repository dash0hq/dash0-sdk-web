# Installation

The SDK is currently distributed as an NPM package.
We are considering adding more distribution formats in the future.
Should you need a currently unavailable format, let us know
by [creating a GitHub issue](https://github.com/dash0hq/dash0-sdk-web/issues) or
via [support@dash0.com](mailto:support@dash0.com).

## Before you begin

You'll need the following before you can start with the Dash0 Web SDK:

- An active Dash0 account. [Sign Up](https://www.dash0.com/sign-up)
- An [Auth Token](https://www.dash0.com/documentation/dash0/key-concepts/auth-tokens); auth tokens for client monitoring
  will be public as part of your website, please make sure to:
  - Use a separate token, exclusively for website monitoring; if you want to monitor multiple websites, it is best to
    use a dedicated token for each
  - Limit the dataset permissions on the auth token to the dataset you want to ingest Website Monitoring data with
  - Limit permissions on the auth token to `Ingesting`
- The [Endpoint](https://www.dash0.com/documentation/dash0/key-concepts/endpoints) url for your dash0 region. You can
  find it via `Organization Settings > Endpoints > OTLP via HTTP`.

## Documentation

Once you have the prerequisites above, follow these guides:

- **[Setup](docs/sdk/setup.md)** — add the SDK via modules or script tags and initialize it, including Content Security
  Policy configuration.
- **[Configuration](docs/sdk/configuration.md)** — all `init` options: backend correlation and propagators,
  configuration auto-detection (Vercel, VCS context), website attributes, telemetry transmission, session tracking,
  error tracking, HTTP request and page-view instrumentation.
- **[API](docs/sdk/api.md)** — runtime API functions: `addSignalAttribute`, `removeSignalAttribute`, `identify`,
  `sendEvent`, `reportError`, `terminateSession`, and `setActiveLogLevel`.
