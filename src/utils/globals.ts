// aliasing globals for improved minification

/* eslint-disable no-restricted-globals */

export type WindowType = typeof window;

// Avoid blowing up in an ssr context. It is important to check via typeof here because window might not even be declared when imported in ssr.
export const win: typeof window | undefined = typeof window !== "undefined" ? window : undefined;
export const doc: typeof window.document | undefined = win?.document;
export const nav: typeof navigator | undefined = win?.navigator;
export const encodeURIComponent: ((arg: string) => string) | undefined = win?.encodeURIComponent;
export const fetch = win?.fetch;
export const localStorage: Storage | null = (function () {
  try {
    return win?.localStorage ?? null;
  } catch {
    // localStorage access is not permitted in certain security modes, e.g.
    // when cookies are completely disabled in web browsers.
    return null;
  }
})();

/**
 * Exposed via this module to enable testing.
 */
export function sendBeacon(url: string, data: string): boolean {
  return nav?.sendBeacon(url, data) ?? false;
}

/* eslint-enable no-restricted-globals */
