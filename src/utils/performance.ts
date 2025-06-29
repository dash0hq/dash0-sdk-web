import { doc, perf, win } from "./globals";
import { now } from "./time";
import { noop } from "./fn";
import { setTimeout } from "./timers";
import { addEventListener, removeEventListener } from "./listeners";

const TEN_MINUTES_IN_MILLIS = 1000 * 60 * 10;
const ONE_DAY_IN_MILLIS = 1000 * 60 * 60 * 24;

export const isResourceTimingAvailable = !!(perf && perf.getEntriesByType);
export const isPerformanceObserverAvailable =
  perf && typeof (win as any)["PerformanceObserver"] === "function" && typeof perf["now"] === "function";

export const PerformanceTimingNames = Object.freeze({
  CONNECT_END: "connectEnd",
  CONNECT_START: "connectStart",
  DECODED_BODY_SIZE: "decodedBodySize",
  DOM_COMPLETE: "domComplete",
  DOM_CONTENT_LOADED_EVENT_END: "domContentLoadedEventEnd",
  DOM_CONTENT_LOADED_EVENT_START: "domContentLoadedEventStart",
  DOM_INTERACTIVE: "domInteractive",
  DOMAIN_LOOKUP_END: "domainLookupEnd",
  DOMAIN_LOOKUP_START: "domainLookupStart",
  ENCODED_BODY_SIZE: "encodedBodySize",
  FETCH_START: "fetchStart",
  LOAD_EVENT_END: "loadEventEnd",
  LOAD_EVENT_START: "loadEventStart",
  NAVIGATION_START: "navigationStart",
  REDIRECT_END: "redirectEnd",
  REDIRECT_START: "redirectStart",
  REQUEST_START: "requestStart",
  RESPONSE_END: "responseEnd",
  RESPONSE_START: "responseStart",
  SECURE_CONNECTION_START: "secureConnectionStart",
  START_TIME: "startTime",
  UNLOAD_EVENT_END: "unloadEventEnd",
  UNLOAD_EVENT_START: "unloadEventStart",
});

export type ObserveResourcePerformanceResult = {
  duration: number;
  resource?: PerformanceResourceTiming | null;
};

type ObserveResourcePerformanceResultCallback = (arg: ObserveResourcePerformanceResult) => any;

type ObserveResourcePerformanceOptions = {
  resourceMatcher: (arg: PerformanceResourceTiming) => boolean;
  maxWaitForResourceMillis: number;
  maxToleranceForResourceTimingsMillis: number;
  onEnd: ObserveResourcePerformanceResultCallback;
};

type PerformanceObservationContoller = {
  start: () => void;
  end: () => void;
  cancel: () => void;
};

export function observeResourcePerformance(opts: ObserveResourcePerformanceOptions): PerformanceObservationContoller {
  if (!isPerformanceObserverAvailable) return observeWithoutPerformanceObserverSupport(opts.onEnd);

  // Used to calculate the duration when no resource was found.
  let startTime: number;
  let endTime: number;

  let resource: PerformanceResourceTiming | undefined;

  // Global resources that will need to be disposed
  let observer: PerformanceObserver | undefined;
  let fallbackNoResourceFoundTimerHandle: ReturnType<typeof setTimeout> | undefined;
  let fallbackEndNeverCalledTimerHandle: ReturnType<typeof setTimeout> | undefined;

  return {
    start: onStart,
    end: onEnd,
    cancel: disposeGlobalResources,
  };

  function onStart() {
    startTime = perf.now();
    try {
      const PerformanceObserver = win?.PerformanceObserver;
      if (PerformanceObserver) {
        observer = new PerformanceObserver(onResourceFound);
        observer?.observe({ type: "resource" });
      }
    } catch (_e) {
      // Some browsers may not support the passed entryTypes and decide to throw an error.
      // This would then result in an error with a message like:
      //
      // entryTypes only contained unsupported types
      //
      // Swallow and ignore the error. Treat it like unavailable performance observer data.
    }
    fallbackEndNeverCalledTimerHandle = setTimeout(disposeGlobalResources, TEN_MINUTES_IN_MILLIS);
  }

  function onEnd() {
    endTime = perf.now();
    cancelFallbackEndNeverCalledTimer();

    if (resource || !isWaitingAcceptable()) {
      end();
    } else {
      addEventListener(doc!, "visibilitychange", onVisibilityChanged);
      fallbackNoResourceFoundTimerHandle = setTimeout(end, opts.maxWaitForResourceMillis);
    }
  }

  function end() {
    disposeGlobalResources();

    // In some old web browsers, e.g. Chrome 31, the value provided as the duration
    // can be very wrong. We have seen cases where this value is measured in years.
    // If this does seem be the case, then we will ignore the duration property and
    // instead prefer our approximation.
    if (resource?.duration && resource.duration < ONE_DAY_IN_MILLIS) {
      opts.onEnd({ resource, duration: Math.round(resource.duration) });
    } else {
      opts.onEnd({ resource, duration: Math.round(endTime - startTime) });
    }
  }

  function onResourceFound(list: PerformanceObserverEntryList) {
    const r = list.getEntriesByType("resource").find((e) => {
      // This polymorphism is not properly represented in the api types. The cast is safe since we're only accessing the resource timings.
      const entry = e as PerformanceResourceTiming;
      return (
        entry.startTime >= startTime &&
        (!endTime || endTime + opts.maxToleranceForResourceTimingsMillis >= entry.responseEnd) &&
        opts.resourceMatcher(entry)
      );
    });

    if (!r) return;

    resource = r as PerformanceResourceTiming;
    if (endTime) end();
  }

  function onVisibilityChanged() {
    if (!isWaitingAcceptable()) end();
  }

  function disposeGlobalResources() {
    disconnectResourceObserver();
    cancelFallbackNoResourceFoundTimer();
    cancelFallbackEndNeverCalledTimer();
    stopVisibilityObservation();
  }

  function disconnectResourceObserver() {
    if (observer) {
      try {
        observer?.disconnect();
      } catch (_e) {
        // Observer disconnect may throw when connect attempt wasn't successful. Ignore this.
      }
      observer = undefined;
    }
  }

  function cancelFallbackNoResourceFoundTimer() {
    if (fallbackNoResourceFoundTimerHandle) {
      clearTimeout(fallbackNoResourceFoundTimerHandle);
      fallbackNoResourceFoundTimerHandle = undefined;
    }
  }

  function cancelFallbackEndNeverCalledTimer() {
    if (fallbackEndNeverCalledTimerHandle) {
      clearTimeout(fallbackEndNeverCalledTimerHandle);
      fallbackEndNeverCalledTimerHandle = undefined;
    }
  }

  function stopVisibilityObservation() {
    if (!doc) return;
    removeEventListener(doc, "visibilitychange", onVisibilityChanged);
  }
}

// We may only wait for resource data to arrive as long as the document is visible or in the process
// of becoming visible. In all other cases we might lose data when waiting, e.g. when the document
// is in the process of being disposed.
function isWaitingAcceptable() {
  return doc?.visibilityState === "visible" || (doc?.visibilityState as string) === "prerender";
}

function observeWithoutPerformanceObserverSupport(
  onEnd: ObserveResourcePerformanceResultCallback
): PerformanceObservationContoller {
  let start: number = 0;

  return {
    start: () => {
      start = now();
    },
    end: () => onEnd({ duration: now() - start }),
    cancel: noop,
  };
}
