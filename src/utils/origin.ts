import { doc, loc } from "./globals";
import { debug } from "./debug";

/**
 * The URLLike interface represents an URL and HTMLAnchorElement compatible fields.
 */
export interface URLLike {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  username: string;
}

let urlAnalysisElement: HTMLAnchorElement | undefined;

function getUrlAnalysisElement() {
  if (!urlAnalysisElement) {
    urlAnalysisElement = doc?.createElement("a");
    if (!urlAnalysisElement) {
      debug("failed to create URL analysis element. Will not be able to execute same-origin checks");
      throw new Error();
    }
  }

  return urlAnalysisElement;
}

/**
 * Parses url using URL constructor or fallback to anchor element.
 * May throw if parsing fails
 * @param url
 */
export function parseUrl(url: string): URLLike {
  if (typeof URL === "function") {
    return new URL(url, doc?.baseURI ?? loc?.href);
  }
  const element = getUrlAnalysisElement();
  element.href = url;
  return element;
}

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
