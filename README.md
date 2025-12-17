# Dash0 Web SDK

This SDK enables users of Dash0's web monitoring features to instrument a website or single-page-application to capture
and transmit telemetry to Dash0.

Features include:

- Page view instrumentation
- Navigation timing instrumentation
- HTTP request instrumentation
- Error tracking

## Getting started

### Prerequisites

To setup the web sdk you'll need the following:

1. Log in to your desired Dash0 account. You can [sign up here](https://www.dash0.com/sign-up)

2. Retrieve the following information from your Dash0 account:

   - The OTLP via HTTP `endpoint` URL for your Dash0 region ([Dash0 link](https://app.dash0.com/settings/endpoints))

   - The `authToken` with `Ingesting` permissions for the dataset ([Dash0 link](https://app.dash0.com/settings/auth-tokens))
     - Auth tokens for client monitoring will be public as part of your website, please make sure to:
       - Use a separate token, exclusively for website monitoring; if you want to monitor multiple websites, it is best to use a dedicated token for each
       - Limit the dataset permissions on the auth token to the dataset you want to ingest Website Monitoring data with
       - Limit permissions on the auth token to `Ingesting`

### Installation steps

1. Add the SDK to your dependencies

```sh
# npm
npm install @dash0/sdk-web
# yarn
yarn add @dash0/sdk-web
# pnpm
pnpm install @dash0/sdk-web
```

2. Initialize the SDK in your code: you'll need to call the `init` function at a convenient time in your applications lifecycle.
   Ideally this should happen as early as possible in the web page initialization, as most instrumentations shipped by the SDK can only observe events after init has been called.

```ts
import { init } from "@dash0/sdk-web";

init({
  serviceName: "my-website",
  endpoint: {
    // Replace this with the endpoint URL for your Dash0 region, that you retrieved earlier in "prerequisites"
    url: "{OTLP via HTTP endpoint}",
    // Replace this with your auth token you retrieved earlier in "prerequisites"
    // Ideally, you will inject the value at build time in order not commit the token to git,
    // even if its effectively public in the HTML you ship to the end user's browser
    authToken: "{authToken}",
  },
});
```

For more detailed instructions, refer to [`INSTALL.md`](./INSTALL.md).

## Development

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for instructions on the development setup, testing and release process.
