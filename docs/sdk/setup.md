# Setup

### Using Modules

1. Add the Dash0 Web SDK to your dependencies

```sh
# npm
npm install @dash0/sdk-web
# yarn
yarn add @dash0/sdk-web
```

2. Initialize the Dash0 Web SDK in your code: you'll need to call the `init` function at a convenient time in your
   applications lifecycle.
   Ideally this should happen as early as possible in the web page intialization, as most instrumentations shipped by
   the Dash0 Web SDK can only observe events after init has been called.

   ```js
   import { init } from "@dash0/sdk-web";

   init({
     serviceName: "my-website",
     endpoint: {
       // Replace this with the endpoint url identified during preparation
       url: "REPLACE THIS",
       // Replace this with the auth token you created earlier
       // Ideally, you will inject the value at build time in order to not commit the token to git,
       // even if its effectively public in the HTML you ship to the end user's browser
       authToken: "REPLACE THIS",
     },
   });
   ```

### Adding the Dash0 Web SDK via script tags

The Dash0 Web SDK can also be injected via script tags, which is useful for websites not using module builds.
To add the Dash0 Web SDK to the HTML of your website, add the snippet below and adjust the configuration as needed.

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
      // Replace this with the auth token you created earlier
      // Ideally, you will inject the value at build time in order to not commit the token to git,
      // even if its effectively public in the HTML you ship to the end user's browser
      authToken: "REPLACE THIS",
    },
  });
</script>
<!--Latest version-->
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web/dist/dash0.iife.js"></script>
<!--Or pin a specific version-->
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web@0.18.1/dist/dash0.iife.js"></script>
```

You can choose to always load the latest version of the Dash0 Web SDK or pin the script to a specific version (see the
example above).
Loading a specific version of the Dash0 Web SDK usually improves loading performance of the script.

#### Api usage

Please note that the API for the IIFE build of the Dash0 Web SDK is slightly different from the module build.
All APIs must be called via a global `dash0` function. For example, the following call `addSignalAttribute("the_answer",
42)` would be called like this for the IIFE build: `dash0("addSignalAttribute", "the_answer", 42)`.

#### Content Security and Integrity

Depending on the content security policy of your site you might need to additionally allow loading of the script.
You can use `Content-Security-Policy: script-src 'self' https://unpkg.com` to allow all scripts from unpkg, or something
like
`Content-Security-Policy: script-src 'self' https://unpkg.com/@dash0/sdk-web@0.18.1/dist/dash0.iife.js` when using a
specific
version of the Dash0 Web SDK to only allow the specific file to be loaded.

If you want to further restrict the policy to guard against changes in the hosted script,
you can allow only the hash of the Dash0 Web SDK version you'd like to integrate, like so:
`Content-Security-Policy: script-src 'self' 'sha256-replace-me'`
The current hash can be viewed by appending `?meta` to the unpkg url you are loading the script from and removing the
file name: `https://unpkg.com/@dash0/sdk-web@0.18.1/dist?meta`
Then find the `dash0.iife.js` file and copy its integrity value.

Additionally you might need to allow the Dash0 Web SDK to connect to your configured endpoint URL like so:
`Content-Security-Policy: connect-src 'self' YOUR_ENDPOINT_URL_HERE`

### Session replay

Session replay is an optional add-on. The recorder ships as its own bundle so websites that do not use session replay pay
nothing for it. Load it in addition to the SDK.

With modules, import the recorder and hand it to `init`:

```js
import { init } from "@dash0/sdk-web";
import { recorder } from "@dash0/sdk-web/session-recording";

init({
  serviceName: "my-website",
  endpoint: { url: "REPLACE THIS", authToken: "REPLACE THIS" },
  sessionRecording: { recorder },
});
```

With script tags, add a second script after the initializer snippet. The order of the two SDK scripts does not
matter.

```html
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web/dist/dash0.iife.js"></script>
<script
  defer
  crossorigin="anonymous"
  src="https://unpkg.com/@dash0/sdk-web/dist/dash0-session-recording.iife.js"
></script>
```

The session replay bundle loads from the same origin as `dash0.iife.js`. A content security policy that allows all of
`https://unpkg.com` (see [Content Security and Integrity](#content-security-and-integrity)) needs no change. If
you allow a specific file URL or a `sha256-` hash instead, add a second entry for
`dash0-session-recording.iife.js`; its integrity value is listed next to `dash0.iife.js` in the `?meta` output.
The recorder requires `Proxy` and `MutationObserver`; the SDK itself keeps working in browsers that lack them,
only session replay is skipped.

Inputs are masked by default. See [Session replay configuration](./configuration.md#session-replay) for
privacy controls, sampling and chunk sizes.

### Profiling

Profiling is an optional add-on for Chromium-based browsers. The protobuf encoder ships as its own bundle, so
websites that do not profile pay nothing for it.

With modules, import the encoder, hand it to `init` and enable the instrumentation:

```js
import { init } from "@dash0/sdk-web";
import { encoder } from "@dash0/sdk-web/profiling";

init({
  serviceName: "my-website",
  endpoint: { url: "REPLACE THIS", authToken: "REPLACE THIS" },
  enabledInstrumentations: [
    "@dash0/navigation",
    "@dash0/web-vitals",
    "@dash0/error",
    "@dash0/fetch",
    "@dash0/xhr",
    "@dash0/profiling",
  ],
  profiling: { encoder, sampleRate: 10 },
});
```

With script tags, load `dash0-profiling.iife.js` before `dash0.iife.js`. Unlike session replay, the order matters:
`init` looks for the encoder once.

```html
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web/dist/dash0-profiling.iife.js"></script>
<script defer crossorigin="anonymous" src="https://unpkg.com/@dash0/sdk-web/dist/dash0.iife.js"></script>
```

The browser only allows profiling when the HTML document is served with this response header:

```
Document-Policy: js-profiling
```

In Next.js, add it in `next.config.js`:

```js
module.exports = {
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Document-Policy", value: "js-profiling" }] }];
  },
};
```

If the app's JavaScript is served from another origin, such as a CDN through `assetPrefix`, also set
`crossOrigin: "anonymous"` in `next.config.js` and allow the page's origin with `Access-Control-Allow-Origin` on
the CDN. Otherwise those frames are missing from the profiles.

The auth token needs the `ingest:profiles` permission. See [Profiling configuration](./configuration.md#profiling)
for sampling, chunk length and what each profile contains.
