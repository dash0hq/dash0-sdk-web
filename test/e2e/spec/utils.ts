import { browser } from "@wdio/globals";

const OTLP_SERVER = "http://127.0.0.1:8011";

/**
 * Counts the `browser.page_view` log records the test server has received so far.
 *
 * Used as a deterministic "the SDK pipeline is live" signal (see loadPage). Runs in the Node test
 * runner, querying the server directly, so it is independent of any browser-side timing.
 */
async function receivedPageViewCount(): Promise<number> {
  const resp = await fetch(`${OTLP_SERVER}/otlp-requests`);
  if (!resp.ok) return 0;
  const requests: any[] = await resp.json();
  let count = 0;
  for (const request of requests) {
    if (request.path !== "/v1/logs") continue;
    for (const resourceLog of request.body?.resourceLogs ?? []) {
      for (const scopeLog of resourceLog.scopeLogs ?? []) {
        for (const logRecord of scopeLog.logRecords ?? []) {
          const isPageView = (logRecord.attributes ?? []).some(
            (a: any) => a.key === "event.name" && a.value?.stringValue === "browser.page_view"
          );
          if (isPageView) count++;
        }
      }
    }
  }
  return count;
}

/**
 * Navigates to `url` and waits until the Dash0 SDK is fully operational before returning.
 *
 * The test pages load the SDK via `<script defer crossorigin src=".../dash0.iife.js">`. On a slow
 * browser session -- notably Safari via the LambdaTest tunnel -- the script can still be loading when
 * the test starts interacting, so the action (fetch / unhandled error / sendEvent) fires before the
 * SDK has instrumented it and no telemetry is produced. Faster browsers just happen to win the race.
 *
 * Inferring readiness from browser-side state (e.g. `window.dash0._q === undefined`) proved
 * unreliable on Safari: a browser.execute() right after navigation can observe a stale document and
 * report ready prematurely, leaving the failures flaky. Instead we wait for a *deterministic*,
 * server-observed signal: a new `browser.page_view` log arriving at the test server. That proves the
 * SDK both initialized and successfully transmitted on the freshly loaded page, so any subsequent
 * action's telemetry is guaranteed to be captured.
 */
export async function loadPage(url: string): Promise<void> {
  // Pages that disable page-view tracking never emit a page_view, so fall back to the browser-side
  // init signal for them. This is the only case that cannot use the server-observed signal.
  if (url.includes("disable-page-view-tracking")) {
    await browser.url(url);
    await browser.waitUntil(
      () => browser.execute(() => !!(window as any).dash0 && (window as any).dash0._q === undefined),
      { timeout: 15000, timeoutMsg: `Dash0 SDK did not finish initializing on ${url} within 15s` }
    );
    return;
  }

  const before = await receivedPageViewCount();
  await browser.url(url);
  await browser.waitUntil(async () => (await receivedPageViewCount()) > before, {
    timeout: 15000,
    interval: 250,
    timeoutMsg: `Did not observe a page_view from the freshly loaded ${url} within 15s`,
  });
}

export function retry<T>(fn: () => Promise<T>, maxMillis: number = 30000, until?: number): Promise<T> {
  until = until || Date.now() + maxMillis;

  if (Date.now() > until) {
    return fn();
  }

  return delay(maxMillis / 20)
    .then(fn)
    .catch(() => retry(fn, maxMillis, until));
}

export function delay(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}
