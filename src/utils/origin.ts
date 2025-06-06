import { parseUrl } from "./url";

/** Returns the origin if present (if in browser context). */
function getOrigin(): string | undefined {
  return typeof location !== "undefined" ? location.origin : undefined;
}

export function isSameOrigin(url: string) {
  try {
    const parsedUrl = parseUrl(url);
    return parsedUrl.origin === getOrigin();
  } catch (_e) {
    return false;
  }
}
