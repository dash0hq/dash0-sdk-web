# Dash0 Web SDK

This SDK enables users of Dash0's web monitoring features to instrument a website or single-page-application to capture
and transmit telemetry to Dash0.

Features include:

- Page view instrumentation
- Navigation timing instrumentation
- HTTP request instrumentation
- Error tracking

## Getting started

1. Get an active Dash0 account. [Sign Up](https://www.Dash0.com/sign-up)
1. Prepare an [Auth Token](https://www.Dash0.com/documentation/Dash0/key-concepts/auth-tokens); auth tokens for client monitoring will be public as part of your website, please make sure to:
  - Use a separate token, exclusively for website monitoring; if you want to monitor multiple websites, it is best to use a dedicated token for each
  - Limit the dataset permissions on the auth token to the dataset you want to ingest Website Monitoring data with
  - Limit permissions on the auth token to `Ingesting`
1. Get the [Endpoint](https://www.Dash0.com/documentation/Dash0/key-concepts/endpoints) URL for your Dash0 region. You can find it via `Organization Settings > Endpoints > OTLP via HTTP`.
1. Add the SDK to your dependencies
  ```sh
  # npm
  npm install @Dash0/sdk-web
  # yarn
  yarn add @Dash0/sdk-web
  ```
2. Initialize the SDK in your code: you'll need to call the `init` function at a convenient time in your applications lifecycle.
   Ideally this should happen as early as possible in the web page intialization, as most instrumentations shipped by the SDK can only observe events after init has been called.

   ```js
   import { init } from "@Dash0/sdk-web";

   init({
     serviceName: "my-website",
     endpoint: {
       // Replace this with the endpoint URL identified during preparation
       url: REPLACE THIS,
       // Replace this with your auth token you created earlier
       // Ideally, you will inject the value at build time in order not commit the token to git,
       // even if its effectively public in the HTML you ship to the end user's browser
       authToken: REPLACE THIS
     },
   });
   ```

For more detailed instructions, refer to [`INSTALL.md`](./INSTALL.md).
