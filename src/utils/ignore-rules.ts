import { MatchPattern, vars } from "../vars";
import { debug } from "./debug";

// The page url is tested once for every signal, and request urls repeat too. Remembering the last few results per
// pattern list turns these into a lookup, which matters for a pattern that is slow on long values.
const MAX_CACHED_RESULTS = 8;
const cachedResults = new WeakMap<readonly MatchPattern[], Map<string, boolean>>();

export function matchesAny(patterns: readonly MatchPattern[], s: string): boolean {
  if (patterns.length === 0) {
    return false;
  }

  let results = cachedResults.get(patterns);
  if (!results) {
    results = new Map();
    cachedResults.set(patterns, results);
  }
  const cached = results.get(s);
  if (cached !== undefined) {
    // Moves the value to the end of the eviction order, so the page url stays cached between request urls.
    results.delete(s);
    results.set(s, cached);
    return cached;
  }

  const result = testAny(patterns, s);
  if (results.size >= MAX_CACHED_RESULTS) {
    results.delete(results.keys().next().value!);
  }
  results.set(s, result);
  return result;
}

function testAny(patterns: readonly MatchPattern[], s: string): boolean {
  for (let i = 0, len = patterns.length; i < len; i++) {
    const pattern = patterns[i]!;
    if (typeof pattern === "string") {
      if (s.includes(pattern)) {
        return true;
      }
      continue;
    }
    // `test` on a global or sticky pattern starts at, and moves, `lastIndex`. Without the reset, a value that matches
    // would only match on every other call.
    if (pattern.global || pattern.sticky) {
      pattern.lastIndex = 0;
    }
    if (pattern.test(s)) {
      return true;
    }
  }

  return false;
}

/**
 * Prepares configured patterns for `matchesAny`. Patterns are only ever used with `test`.
 *
 * Strings are trimmed, and strings that are empty after that are dropped. An empty string would match every value,
 * which an unset variable in e.g. `IGNORE_URLS.split(",")` gives by accident.
 *
 * Regular expressions are rewritten so that `test` gives the same results faster. An optional item at the start of a
 * pattern, as in `/.*\/callback/` or `/\S*token=/`, makes a failed `test` take time quadratic in the value length: the
 * engine retries from every position, and the item consumes the rest of the run each time. Because the item may match
 * nothing, `/A*R/` matches exactly the values that `/R/` matches, so it is removed. Sticky patterns are kept, since
 * there `A*` decides how far a match can reach from `lastIndex`.
 */
export function normalizePatterns<T extends MatchPattern>(patterns: T[], option: string): T[] {
  // Plain JavaScript configurations can pass a single value without the brackets. Looping over the characters of a
  // string like "/health" would match "/" against every value, so a single value is used as a one-item array.
  const single = patterns as unknown;
  if (typeof single === "string" || single instanceof RegExp) {
    debug(`'${option}' should be an array. Using the single value as a one-item array.`);
    patterns = [single as T];
  }
  // Configurations from plain JavaScript can hold anything. They must not break init.
  if (!Array.isArray(patterns)) {
    return patterns;
  }
  const result: T[] = [];
  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      result.push(optimizePattern(pattern) as T);
    } else if (typeof pattern !== "string") {
      result.push(pattern);
    } else if (pattern.trim()) {
      result.push(pattern.trim() as T);
    } else {
      debug(`Ignoring an empty string in '${option}'. Use a regular expression to match whitespace.`);
    }
  }
  return result;
}

function optimizePattern(pattern: RegExp): RegExp {
  if (pattern.sticky) {
    return pattern;
  }
  let source = pattern.source;
  let length: number;
  while ((length = leadingOptionalItemLength(source, pattern.flags.includes("v"))) > 0) {
    source = source.slice(length);
  }
  if (source === pattern.source) {
    return pattern;
  }
  try {
    return new RegExp(source, pattern.flags);
  } catch {
    return pattern;
  }
}

// Escapes that stand for exactly one character and can not be a back reference.
const SINGLE_CHARACTER_ESCAPE = /^\\(?:[dDwWsStnrfv]|[^A-Za-z0-9])/;

/**
 * The length of a leading `X*` or `X*?` where X matches a single character and holds no capture group: `.`, a
 * character class or an escape like `\S`. Zero when the source does not start with one.
 */
function leadingOptionalItemLength(source: string, unicodeSets: boolean): number {
  let end: number;
  if (source[0] === ".") {
    end = 1;
  } else if (source[0] === "\\") {
    const escape = SINGLE_CHARACTER_ESCAPE.exec(source);
    if (!escape) return 0;
    end = escape[0].length;
  } else if (source[0] === "[" && !unicodeSets) {
    end = characterClassEnd(source);
    if (end < 0) return 0;
  } else {
    return 0;
  }
  if (source[end] !== "*") {
    return 0;
  }
  return source[end + 1] === "?" ? end + 2 : end + 1;
}

/** The index after the `]` that closes the class starting at index 0, or -1. A `]` right after `[` or `[^` closes it. */
function characterClassEnd(source: string): number {
  for (let i = 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
    } else if (source[i] === "]") {
      return i + 1;
    }
  }
  return -1;
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
