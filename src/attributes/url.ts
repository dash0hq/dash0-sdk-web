import { addAttribute, AttrPrefix, withPrefix } from "../utils/otel";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";
import { identity, parseUrl } from "../utils";
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

export function addUrlAttributes(attributes: KeyValue[], url: string | URL, prefix?: AttrPrefix) {
  const applyPrefix = withPrefix(prefix);

  try {
    const parsed = parseUrl(url);
    if (parsed.username) parsed.username = "REDACTED";
    if (parsed.password) parsed.password = "REDACTED";

    const attrs = vars.urlAttributeScrubber({
      [URL_FULL]: parsed.href,
      [URL_PATH]: parsed.pathname,
      [URL_DOMAIN]: parsed.hostname,
      [URL_SCHEME]: parsed.protocol.replace(":", ""),
      [URL_FRAGMENT]: parsed.hash ? parsed.hash.replace("#", "") : undefined,
      [URL_QUERY]: parsed.search ? parsed.search.replace("?", "") : undefined,
    });

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
