import { vars } from "../vars";

export function matchesAny(regexp: RegExp[], s: string) {
  for (let i = 0, len = regexp.length; i < len; i++) {
    if (regexp[i]!.test(s)) {
      return true;
    }
  }

  return false;
}

const DATA_URL_PREFIX = "data:";

export function isUrlIgnored(url?: string | number): boolean {
  if (!url) {
    return true;
  }

  // Force string conversion. During runtime we have seen that some URLs passed into this code path aren't actually
  // strings. Reason currently unknown.
  url = String(url);
  if (!url) {
    return true;
  }

  // We never want to track data URLs. Instead of matching these via regular expressions (which might be expensive),
  // we are explicitly doing a startsWith ignore case check
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
  if (url.substring == null || url.substring(0, DATA_URL_PREFIX.length).toLowerCase() === DATA_URL_PREFIX) {
    return true;
  }

  // Disable monitoring of data transmission requests. The data transmission strategy already ensures
  // that data transmission requests are not picked up internally. However, we have seen some users
  // leverage custom (broken) XMLHttpRequest instrumentation to implement application code which
  // then break the detection of data transmission requests.
  if (isTransportRequest(url)) {
    return true;
  }

  return matchesAny(vars.ignoreUrls, url);
}

function isTransportRequest(url: string) {
  const lowerCaseUrl = url.toLowerCase();

  for (let i = 0, len = vars.endpoints.length; i < len; i++) {
    const endpoint = vars.endpoints[i]!;
    if (lowerCaseUrl.startsWith(endpoint.url)) {
      return true;
    }
  }
  return false;
}

// The second form is what old Edge and IE report.
const CROSS_ORIGIN_SCRIPT_ERROR = /^(Script error\.?|Javascript error: Script error\.? on line 0)$/;

const BROWSER_EXTENSION_URL =
  /^(chrome-extension|moz-extension|ms-browser-extension|safari-extension|safari-web-extension|webkit-masked-url):\/\//i;

const URL_IN_FRAME = /[a-z][a-z0-9+.-]*:\/\/[^\s()]+/i;

export function isErrorIgnored(message: string, stack?: string): boolean {
  if (matchesAny(vars.ignoreErrorMessages, message)) {
    return true;
  }
  if (vars.ignoreCrossOriginScriptErrors && CROSS_ORIGIN_SCRIPT_ERROR.test(message)) {
    return true;
  }
  return vars.ignoreBrowserExtensionErrors && isThrownInBrowserExtension(stack);
}

function isThrownInBrowserExtension(stack?: string): boolean {
  const url = urlOfThrowingFrame(stack);
  return url != null && BROWSER_EXTENSION_URL.test(url);
}

/**
 * The URL of the topmost stack frame that has one, skipping frames such as `<anonymous>` and `[native code]`.
 */
function urlOfThrowingFrame(stack?: string): string | undefined {
  if (!stack) {
    return undefined;
  }
  const lines = stack.split("\n");
  // V8 stacks start with the error's message, which may hold any URL; their frames start with "at".
  const v8Frames = lines.filter((line) => line.trim().startsWith("at "));
  for (const frame of v8Frames.length > 0 ? v8Frames : lines) {
    const url = URL_IN_FRAME.exec(frame);
    if (url) {
      return url[0];
    }
  }
  return undefined;
}
