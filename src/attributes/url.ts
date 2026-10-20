import { addAttribute, AttrPrefix, withPrefix } from "../utils/otel";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";
import { debug, doc, identity, parseUrl, perf, win } from "../utils";
import { KeyValue } from "../types/otlp";
import { vars } from "../vars";

export type UrlAttributeRecord = {
  [URL_FULL]: string;
  [URL_PATH]?: string | undefined;
  [URL_DOMAIN]?: string | undefined;
  [URL_SCHEME]?: string | undefined;
  [URL_FRAGMENT]?: string | undefined;
  [URL_QUERY]?: string | undefined;
};

export type UrlAttributeScrubber = (attr: UrlAttributeRecord) => UrlAttributeRecord;

const REDACTED = "REDACTED";

function scrubUrlAttributes(url: string | URL): UrlAttributeRecord {
  const parsed = parseUrl(url);
  if (parsed.username) parsed.username = REDACTED;
  if (parsed.password) parsed.password = REDACTED;

  const original: UrlAttributeRecord = {
    [URL_FULL]: parsed.href,
    [URL_PATH]: parsed.pathname,
    [URL_DOMAIN]: parsed.hostname,
    [URL_SCHEME]: parsed.protocol.replace(":", ""),
    [URL_FRAGMENT]: parsed.hash ? parsed.hash.replace("#", "") : undefined,
    [URL_QUERY]: parsed.search ? parsed.search.replace("?", "") : undefined,
  };
  const attrs = vars.urlAttributeScrubber({ ...original });
  const parts = [URL_SCHEME, URL_DOMAIN, URL_PATH, URL_QUERY, URL_FRAGMENT] as const;
  if (attrs[URL_FULL] !== parsed.href || parts.every((key) => attrs[key] === original[key])) {
    return attrs;
  }

  // A scrubber that only redacts url parts would otherwise still leak them through `url.full`, which is also used
  // wherever a url is reported as plain text. Removed parts are left out of `url.full` as well.
  const scheme = attrs[URL_SCHEME];
  const domain = attrs[URL_DOMAIN];
  const path = attrs[URL_PATH] ?? "";
  const query = attrs[URL_QUERY];
  const fragment = attrs[URL_FRAGMENT];
  // Only urls like `https://host/path` have an authority, and only with a domain. Credentials and port are no url
  // attributes, so they are taken from the parsed url.
  const hasAuthority = parsed.href.startsWith(parsed.protocol + "//") && domain !== undefined;
  const credentials =
    parsed.username || parsed.password ? parsed.username + (parsed.password ? ":" + parsed.password : "") + "@" : "";
  return {
    ...attrs,
    [URL_FULL]:
      (scheme !== undefined ? scheme + ":" : "") +
      (hasAuthority ? "//" + credentials + domain + (parsed.port ? ":" + parsed.port : "") : "") +
      // Keeps the host separated from a scrubbed path like `REDACTED`.
      (parsed.pathname.startsWith("/") && !path.startsWith("/") ? "/" : "") +
      path +
      (query !== undefined ? "?" + query : "") +
      (fragment !== undefined ? "#" + fragment : ""),
  };
}

export function addUrlAttributes(attributes: KeyValue[], url: string | URL, prefix?: AttrPrefix) {
  const applyPrefix = withPrefix(prefix);

  try {
    const attrs = scrubUrlAttributes(url);

    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined) {
        addAttribute(attributes, applyPrefix(key), value);
      }
    });
  } catch (_e) {
    // This is fallback handling in case the url failed to parse or the user defined attribute scrubber behaved unexpectedly
    // If the user did not attempt scrubbing we'll supply the full url for debugging purposes, otherwise we drop all url
    // attributes
    if (vars.urlAttributeScrubber === identity) {
      // `identity` is the default assignment for this option
      addAttribute(attributes, applyPrefix(URL_FULL), String(url));
    }
  }
}

/**
 * Applies the url attribute scrubber to a url that is reported as plain text, e.g. inside a log body or a status
 * message, rather than as url attributes. Only the scrubbed `url.full` value is used.
 */
export function scrubUrl(url: string): string {
  try {
    return scrubUrlAttributes(url)[URL_FULL] ?? REDACTED;
  } catch (e) {
    debug("Failed to scrub url", e);
    // Mirrors addUrlAttributes: without a user defined scrubber the raw url is kept for debugging purposes.
    // Otherwise the url cannot be dropped from the surrounding text, so it is redacted entirely.
    return vars.urlAttributeScrubber === identity ? url : REDACTED;
  }
}

const SCHEME_CHAR = /[a-z\d+.-]/i;
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;
const FRAGMENT = /#[^\s"'`<>()[\]{}]*/y;
// Stack frame positions (`:12:5`) and sentence punctuation that can follow a url.
const URL_SUFFIX = /(?::\d+){0,2}[.,;!?]*$/;
const URL_END = /(?::\d+){0,2}[.,;!?]*(?:$|[\s"'`<>()[\]{}])/y;

/**
 * Error messages and stack traces of inline scripts contain the page url, which can hold sensitive query parameters.
 * Only urls equal to a page url or the given request url are replaced, so unrelated script urls stay untouched.
 */
export function scrubPageUrls(text: string, requestUrl?: string): string {
  const knownUrls = [
    win?.location.href,
    doc?.referrer,
    // Inline scripts keep the url the document was loaded with, even after `history.replaceState` removed e.g. OAuth
    // parameters from `location.href`.
    perf?.getEntriesByType?.("navigation")[0]?.name,
    requestUrl,
  ]
    .filter((u): u is string => !!u)
    // Fragments are ignored when comparing: stack frames can omit them, and apps remove them from the page url.
    .map((u) => u.split("#")[0]!)
    .filter((u) => ABSOLUTE_URL.test(u))
    // Longest first, so a request url is not cut short by a page url it starts with.
    .sort((a, b) => b.length - a.length);
  if (knownUrls.length === 0) return text;

  // Known urls are searched literally instead of tokenizing the text: queries keep `[` `(` `{` unencoded, and a token
  // cut short at one of them would never match, leaking the whole url.
  let result = "";
  let from = 0;
  for (;;) {
    let best: { start: number; end: number } | undefined;
    for (const known of knownUrls) {
      for (let start = text.indexOf(known, from); start !== -1; start = text.indexOf(known, start + 1)) {
        if (best && start >= best.start) break;
        const end = knownUrlEnd(text, start, known);
        if (end !== -1) {
          best = { start, end };
          break;
        }
      }
    }
    if (!best) return result + text.slice(from);
    result += text.slice(from, best.start) + scrubUrl(text.slice(best.start, best.end));
    from = best.end;
  }
}

/** End of the known url at `start`, including its fragment, or -1 when it is only part of another url. */
function knownUrlEnd(text: string, start: number, known: string): number {
  if (start > 0 && SCHEME_CHAR.test(text[start - 1]!)) return -1;
  let end = start + known.length;
  FRAGMENT.lastIndex = end;
  const fragment = FRAGMENT.exec(text)?.[0];
  if (fragment) end += fragment.length - URL_SUFFIX.exec(fragment)![0].length;
  URL_END.lastIndex = end;
  return URL_END.test(text) ? end : -1;
}
