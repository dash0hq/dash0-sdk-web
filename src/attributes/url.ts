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

// Any absolute url, up to whitespace, quotes or brackets.
const URL_TOKEN = /[a-z][a-z\d+.-]*:\/\/[^\s"'`<>()[\]{}]+/gi;
// Stack frame positions (`:12:5`) and sentence punctuation that can follow a url token.
const URL_TOKEN_SUFFIX = /(?::\d+){0,2}[.,;!?]*$/;

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
    .map((u) => u.split("#")[0]);
  if (knownUrls.length === 0) return text;

  return text.replace(URL_TOKEN, (token) => {
    const suffix = URL_TOKEN_SUFFIX.exec(token)![0];
    const url = token.slice(0, token.length - suffix.length);
    return knownUrls.indexOf(url.split("#")[0]!) !== -1 ? scrubUrl(url) + suffix : token;
  });
}
