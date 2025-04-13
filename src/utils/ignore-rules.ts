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

export function isErrorMessageIgnored(message?: string) {
  return !message || matchesAny(vars.ignoreErrorMessages, message);
}
