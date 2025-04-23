import { win } from "./globals";

export const perf =
  win?.performance || (win as any)?.webkitPerformance || (win as any)?.msPerformance || (win as any)?.mozPerformance;

export const isResourceTimingAvailable = !!(perf && perf.getEntriesByType);
export const isPerformanceObserverAvailable =
  perf && typeof (win as any)["PerformanceObserver"] === "function" && typeof perf["now"] === "function";
