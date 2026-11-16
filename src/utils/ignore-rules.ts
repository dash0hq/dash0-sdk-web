import { MatchPattern, vars } from "../vars";
import { debug } from "./debug";

export function matchesAny(patterns: readonly MatchPattern[], s: string) {
  for (let i = 0, len = patterns.length; i < len; i++) {
    const pattern = patterns[i]!;
    if (typeof pattern === "string" ? s.includes(pattern) : pattern.test(s)) {
      return true;
    }
  }

  return false;
}

/**
 * Prepares configured patterns for `matchesAny`: strings are trimmed, and strings that are empty after that are
 * dropped. An empty string would match every value, which an unset variable in e.g. `IGNORE_URLS.split(",")` gives by
 * accident.
 */
export function normalizePatterns(patterns: MatchPattern[], option: string): MatchPattern[] {
  // Plain JavaScript configurations can pass a single value without the brackets. Looping over the characters of a
  // string like "/health" would match "/" against every value, so a single value is used as a one-item array.
  const single = patterns as unknown;
  if (typeof single === "string" || single instanceof RegExp) {
    debug(`'${option}' should be an array. Using the single value as a one-item array.`);
    patterns = [single];
  }
  // Configurations from plain JavaScript can hold anything. They must not break init.
  if (!Array.isArray(patterns)) {
    return patterns;
  }
  const result: MatchPattern[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "string") {
      result.push(pattern);
    } else if (pattern.trim()) {
      result.push(pattern.trim());
    } else {
      debug(`Ignoring an empty string in '${option}'. Use a regular expression to match whitespace.`);
    }
  }
  return result;
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
  return vars.ignoreBrowserExtensionErrors && hasOnlyBrowserExtensionFrames(message, stack);
}

/**
 * True when the stack has frames with a URL and every one of them belongs to a browser extension. A single page
 * frame keeps the error, so a page error that passes through an extension's wrapper of fetch, XHR,
 * addEventListener or setTimeout is still reported.
 */
function hasOnlyBrowserExtensionFrames(message: string, stack?: string): boolean {
  if (!stack) {
    return false;
  }
  const lines = stack.split("\n");
  // V8 starts the stack with "<name>: <message>". The message can span lines and hold URLs, even another error's stack.
  const firstFrame = isMessageHeader(lines[0]!, message) ? message.split("\n").length : 0;
  let hasExtensionFrame = false;
  for (let i = firstFrame; i < lines.length; i++) {
    const url = URL_IN_FRAME.exec(lines[i]!);
    if (!url) {
      continue;
    }
    if (!BROWSER_EXTENSION_URL.test(url[0])) {
      return false;
    }
    hasExtensionFrame = true;
  }
  return hasExtensionFrame;
}

/**
 * Whether the stack's first line is the error message, as in V8's "TypeError: x". The reported message may carry a
 * prefix such as "Uncaught " or "Unhandled promise rejection: ", so the line's text must end the message's first line.
 */
function isMessageHeader(firstLine: string, message: string): boolean {
  const separator = firstLine.indexOf(": ");
  const text = separator < 0 ? firstLine : firstLine.slice(separator + 2);
  const messageEnd = message.indexOf("\n");
  return text !== "" && (messageEnd < 0 ? message : message.slice(0, messageEnd)).endsWith(text);
}
