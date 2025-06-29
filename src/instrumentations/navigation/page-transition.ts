import { debug, nowNanos, win, wrap } from "../../utils";
import { vars } from "../../vars";
import { transmitPageViewEvent } from "./event";

type LocationState = Partial<{
  path: string;
  search: string;
  hash: string;
}>;

let currentLocation: LocationState = {};
let shouldIncludeHashChanges = false;
let shouldIncludeSearchChanges = false;

/**
 * Tracks page transitions (virtual page views) as per this OTel spec:
 * https://github.com/open-telemetry/semantic-conventions/pull/1910/files
 *
 * Notable difference: The full URL is transmitted as a signal attribute.
 */
export function startPageTransitionInstrumentation() {
  if (!win || !win.history) {
    debug("Browser does not support history API, skipping instrumentation");
    return;
  }

  if (!vars.pageViewInstrumentation.trackVirtualPageViews) {
    return;
  }

  shouldIncludeSearchChanges = vars.pageViewInstrumentation.includeParts?.includes("SEARCH") ?? false;
  shouldIncludeHashChanges = vars.pageViewInstrumentation.includeParts?.includes("HASH") ?? false;

  /**
   * Not wrapping history.go, history.backward and history.forward here, because their call signatures don't receive
   * url information. For these cases we can use the popstate and hashchange events.
   */
  wrap(
    win.history,
    "replaceState",
    (original) =>
      function (this: History, state, unused, url) {
        onUrlChange(url ? String(url) : undefined, true);
        return original.apply(this, [state, unused, url]);
      }
  );
  wrap(
    win.history,
    "pushState",
    (original) =>
      function (this: History, state, unused, url) {
        onUrlChange(url ? String(url) : undefined);
        return original.apply(this, [state, unused, url]);
      }
  );

  win.addEventListener("hashchange", onHashChange);
  win.addEventListener("popstate", onPopState);

  try {
    updateCurrentLocation(new URL(win.location.href));
  } catch {}
}

function onPopState() {
  // popState event is fired after the location entry has been updated, so the location should already contain the new url.
  onUrlChange(win?.location.href);
}

function onHashChange(event: HashChangeEvent) {
  onUrlChange(event.newURL);
}

function onUrlChange(url?: string, replaced?: boolean) {
  if (!url) return;

  try {
    const parsedUrl = new URL(url, win?.location.href);
    if (isLocationChange(parsedUrl)) {
      updateCurrentLocation(parsedUrl);
      transmitPageViewEvent(nowNanos(), parsedUrl, true, Boolean(replaced));
    }
  } catch (e) {
    debug("Failed to handle url change", e);
  }
}

function updateCurrentLocation(url: URL) {
  currentLocation.path = url.pathname;
  currentLocation.search = url.search;
  currentLocation.hash = url.hash;
}

function isLocationChange(newUrl: URL) {
  return (
    newUrl.pathname !== currentLocation.path ||
    (shouldIncludeSearchChanges && newUrl.search !== currentLocation.search) ||
    (shouldIncludeHashChanges && newUrl.hash !== currentLocation.hash)
  );
}
