import { transmitManualPageViewEvent } from "../instrumentations/navigation/event";
import { AttributeValueType } from "../utils/otel";
import { AnyValue } from "../types/otlp";
import { debug, nowNanos, win } from "../utils";
import { vars } from "../vars";

export type StartViewOptions = {
  /**
   * Optionally override the url reflected in `page.url.*` attributes for this view.
   * Accepts an absolute or relative url; relative urls are resolved against the current
   * `location.href`. Falls back to the real `location.href` if omitted or invalid.
   * This is display-only: calling startView never navigates or mutates history/location.
   */
  url?: string;

  /**
   * Additional attributes to include with the page view.
   */
  attributes?: Record<string, AttributeValueType | AnyValue>;
};

/**
 * Manually records a page view, side-effect free: this never calls `history.pushState` /
 * `history.replaceState` and never mutates `location`. Intended for single-page applications
 * that own their own router and cannot let the SDK touch navigation state (e.g. Electron apps
 * serving the whole app from one root URL, where automatic page-view tracking would report
 * every screen as "/").
 *
 * The emitted event is indistinguishable from an automatic virtual page view downstream
 * (same `browser.page_view` event name, same `type` value), with two differences: it is never
 * accompanied by a `change_state` value, since no history mutation occurred, and the
 * `pageViewInstrumentation`'s `generateMetadata` callback is not invoked for manual views —
 * supply title and attributes directly instead.
 *
 * @param name The name of the view, e.g. "/settings". Transmitted as the page view's title.
 * @param opts Additional page view details.
 */
export function startView(name: string, opts?: StartViewOptions) {
  if (vars.endpoints.length === 0) {
    debug("Dash0 SDK has not been initialized. Ignoring startView call.");
    return;
  }

  // The script entrypoint forwards dash0("startView", ...) arguments without type checking,
  // so malformed calls must degrade to a logged no-op instead of throwing. An uncaught throw
  // here would abort the command-queue drain and drop all subsequently queued api calls.
  if (typeof name !== "string" || name.length === 0) {
    debug("startView requires a non-empty view name. Ignoring startView call.");
    return;
  }

  let url: URL | undefined;
  if (opts?.url != null) {
    try {
      url = new URL(opts.url, win?.location.href);
    } catch (e) {
      debug("Failed to parse startView url option. Falling back to the current location.", e);
    }
  }

  transmitManualPageViewEvent({
    timeUnixNano: nowNanos(),
    title: name,
    url,
    attributes: opts?.attributes,
  });
}
