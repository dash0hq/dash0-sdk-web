export type ResourceTimingSettings = {
  /**
   * Restricts capture to these `PerformanceResourceTiming.initiatorType` values, e.g.
   * `["script", "css", "img"]`. When undefined (the default) every initiator type is captured
   * except `fetch` and `xmlhttprequest`, which the fetch and XHR instrumentations already cover.
   *
   * Left undefined by default on purpose: the set of initiator types browsers report is not fixed,
   * so an allow list shipped as a default would silently drop resource kinds added later.
   */
  initiatorTypes?: string[];

  /**
   * The maximum number of static-asset spans to emit for one page view. Pages with very many assets
   * are exactly the pages worth measuring, but one span per asset is also the SDK's highest-volume
   * signal, so the cap bounds what a single page can cost.
   *
   * The budget is reset by every page view, including the virtual ones a single-page app produces,
   * so an app that never reloads does not go quiet for the rest of the session once one page has
   * spent it.
   *
   * Reaching the cap is reported through `debug()`: a silently truncated waterfall is
   * indistinguishable from a complete one.
   *
   * @default 100
   */
  maxSpansPerPageLoad?: number;
};
