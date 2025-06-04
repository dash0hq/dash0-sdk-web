import { KeyValue } from "../../types/otlp";
import { addAttribute } from "../utils/otel";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";
import { parseUrl } from "../utils/url";

export function addUrlAttributes(attributes: KeyValue[], url: string | URL) {
  try {
    const parsed = parseUrl(url);
    if (parsed.username) parsed.username = "REDACTED";
    if (parsed.password) parsed.password = "REDACTED";

    addAttribute(attributes, URL_FULL, parsed.href);
    addAttribute(attributes, URL_PATH, parsed.pathname);
    addAttribute(attributes, URL_DOMAIN, parsed.hostname);
    addAttribute(attributes, URL_SCHEME, parsed.protocol.replace(":", ""));
    if (parsed.hash) {
      addAttribute(attributes, URL_FRAGMENT, parsed.hash.replace("#", ""));
    }
    if (parsed.search) {
      addAttribute(attributes, URL_QUERY, parsed.search.replace("?", ""));
    }
  } catch (_e) {
    addAttribute(attributes, URL_FULL, String(url));
  }
}
