import { KeyValue } from "../../types/otlp";
import { addAttribute, AttrPrefix, withPrefix } from "../utils/otel";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";
import { parseUrl } from "../utils";

export function addUrlAttributes(attributes: KeyValue[], url: string | URL, prefix?: AttrPrefix) {
  const applyPrefix = withPrefix(prefix);

  try {
    const parsed = parseUrl(url);
    if (parsed.username) parsed.username = "REDACTED";
    if (parsed.password) parsed.password = "REDACTED";

    addAttribute(attributes, applyPrefix(URL_FULL), parsed.href);
    addAttribute(attributes, applyPrefix(URL_PATH), parsed.pathname);
    addAttribute(attributes, applyPrefix(URL_DOMAIN), parsed.hostname);
    addAttribute(attributes, applyPrefix(URL_SCHEME), parsed.protocol.replace(":", ""));
    if (parsed.hash) {
      addAttribute(attributes, applyPrefix(URL_FRAGMENT), parsed.hash.replace("#", ""));
    }
    if (parsed.search) {
      addAttribute(attributes, applyPrefix(URL_QUERY), parsed.search.replace("?", ""));
    }
  } catch (_e) {
    addAttribute(attributes, applyPrefix(URL_FULL), String(url));
  }
}
