// aliasing globals for improved minification

export const win: typeof window = window;
export const doc: typeof win.document = win.document;
export const nav: typeof navigator = navigator;
export const encodeURIComponent: (arg: string) => string = win.encodeURIComponent;
export const fetch = win.fetch;
export const localStorage: Storage | null = (function () {
  try {
    return win.localStorage;
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
  return nav.sendBeacon(url, data);
}
