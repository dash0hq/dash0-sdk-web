import { doc, loc } from "./globals";

/**
 * Parses url using URL constructor. Supports URL objects as passthrough input to simplify implementations
 * May throw if parsing fails
 * @param url
 */
export function parseUrl(url: string | URL): URL {
  if (typeof url !== "string") return url;

  return new URL(url, doc?.baseURI ?? loc?.href);
}
