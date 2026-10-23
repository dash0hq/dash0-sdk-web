import { addAttribute, AttrPrefix, withPrefix } from "../utils/otel";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";
import { debug, doc, identity, parseUrl, perf, win } from "../utils";
import { KeyValue } from "../types/otlp";
import { vars } from "../vars";
import { matchesAny } from "../utils/ignore-rules";

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

  // A scrubber that only redacts url parts would otherwise still leak them through `url.full`, which is also used
  // wherever a url is reported as plain text.
  const parts = [URL_SCHEME, URL_DOMAIN, URL_PATH, URL_QUERY, URL_FRAGMENT] as const;
  if (attrs[URL_FULL] === parsed.href && parts.some((key) => attrs[key] !== original[key])) {
    return { ...attrs, [URL_FULL]: buildFullUrl(attrs, parsed) };
  }
  return attrs;
}

/**
 * Builds `url.full` from scrubbed url attributes. Removed parts are left out. Credentials and port are no url
 * attributes, so they are taken from the parsed url.
 */
function buildFullUrl(attrs: UrlAttributeRecord, parsed: URL): string {
  const domain = attrs[URL_DOMAIN];
  const path = attrs[URL_PATH] ?? "";

  const scheme = attrs[URL_SCHEME] === undefined ? "" : `${attrs[URL_SCHEME]}:`;
  // Only urls like `https://host/path` have an authority, and only while they still have a domain.
  const hasAuthority = parsed.href.startsWith(`${parsed.protocol}//`) && domain !== undefined;
  const password = parsed.password ? `:${parsed.password}` : "";
  const credentials = parsed.username || password ? `${parsed.username}${password}@` : "";
  const port = parsed.port ? `:${parsed.port}` : "";
  const authority = hasAuthority ? `//${credentials}${domain}${port}` : "";
  // Keeps the host separated from a scrubbed path like `REDACTED`.
  const pathSeparator = parsed.pathname.startsWith("/") && !path.startsWith("/") ? "/" : "";
  const query = attrs[URL_QUERY] === undefined ? "" : `?${attrs[URL_QUERY]}`;
  const fragment = attrs[URL_FRAGMENT] === undefined ? "" : `#${attrs[URL_FRAGMENT]}`;

  return scheme + authority + pathSeparator + path + query + fragment;
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

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;
// What may follow a known url: an optional fragment, then stack frame positions (`:12:5`) or sentence punctuation,
// then the end of the url. Queries keep `[` `(` `{` unencoded, so these only end a url after the known part.
const URL_TAIL = /(#[^\s"'`<>()[\]{}]*?)?(?::\d+){0,2}[.,;!?]*(?=$|[\s"'`<>()[\]{}])/y;

type Match = { start: number; end: number };

/**
 * Error messages and stack traces of inline scripts contain the page url, which can hold sensitive query parameters.
 * Only urls equal to a page url or the given request url are replaced, so unrelated script urls stay untouched.
 * Urls that match ignoreUrls are redacted entirely.
 */
export function scrubPageUrls(text: string, requestUrl?: string): string {
  let result = "";
  let from = 0;
  for (const { start, end } of findKnownUrls(text, knownUrls(requestUrl))) {
    // Skipping overlaps scrubs every url once, so scrubbed output is never scrubbed again.
    if (start < from) continue;
    const url = text.slice(start, end);
    result += text.slice(from, start) + (matchesAny(vars.ignoreUrls, url) ? REDACTED : scrubUrl(url));
    from = end;
  }
  return result + text.slice(from);
}

/** Page urls and the request url without fragments: stack frames can omit them, and apps remove them from the page. */
function knownUrls(requestUrl?: string): string[] {
  return [
    win?.location.href,
    doc?.referrer,
    // Inline scripts keep the url the document was loaded with, even after `history.replaceState` removed e.g. OAuth
    // parameters from `location.href`.
    perf?.getEntriesByType?.("navigation")[0]?.name,
    requestUrl,
  ]
    .map((url) => url?.split("#")[0])
    .filter((url): url is string => !!url && ABSOLUTE_URL.test(url));
}

/** Occurrences of the urls in the text, leftmost first, and longest first when several start at the same position. */
function findKnownUrls(text: string, urls: string[]): Match[] {
  const matches: Match[] = [];
  for (const url of urls) {
    for (let start = text.indexOf(url); start !== -1; start = text.indexOf(url, start + 1)) {
      const end = urlEnd(text, start + url.length);
      if (end !== undefined) matches.push({ start, end });
    }
  }
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** End of a url whose tail starts at `index`, or `undefined` when the url continues, i.e. it is a different url. */
function urlEnd(text: string, index: number): number | undefined {
  URL_TAIL.lastIndex = index;
  const tail = URL_TAIL.exec(text);
  return tail ? index + (tail[1]?.length ?? 0) : undefined;
}
