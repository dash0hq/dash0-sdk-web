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
