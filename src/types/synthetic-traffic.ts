/**
 * The category of a page view that was not produced by a person, following the OpenTelemetry semantic convention
 * `user_agent.synthetic.type`.
 *
 * - `bot`: crawlers, link previewers, SEO and uptime tools. Nobody is looking at the page.
 * - `test`: automated browsers such as end-to-end test runners, synthetic monitoring and performance audits. Somebody
 *   cares about the result, just not as real-user data.
 */
export type SyntheticTrafficType = "bot" | "test";

/**
 * What the SDK does with a page view of a given synthetic category.
 *
 * - `ignore`: the SDK starts no instrumentation and transmits nothing, as if the session was sampled out.
 * - `transmit`: telemetry is collected as usual, and every signal carries `user_agent.synthetic.type`.
 */
export type SyntheticTrafficPolicy = "ignore" | "transmit";

export type SyntheticTrafficSettings = {
  /**
   * What to do with page views from crawlers and other bots.
   *
   * @default "ignore"
   */
  bots?: SyntheticTrafficPolicy;

  /**
   * What to do with page views from automated browsers: test runners, synthetic monitoring and performance audits.
   *
   * @default "transmit"
   */
  tests?: SyntheticTrafficPolicy;

  /**
   * Additional user agent patterns that identify bots, on top of the built-in ones.
   */
  botUserAgents?: RegExp[];

  /**
   * Additional user agent patterns that identify automated tests, on top of the built-in ones. Useful when a
   * synthetic monitoring tool sets a custom user agent.
   */
  testUserAgents?: RegExp[];

  /**
   * Overrides the built-in classification. Return `"bot"` or `"test"` to classify the page view, `"human"` to treat
   * it as real-user traffic even when the built-in rules would not, or `undefined` to fall back to the built-in
   * rules. Runs once during `init()`.
   *
   * Use it for signals only the application knows about, e.g. a query parameter or cookie that a synthetic check
   * sets, or to exempt an in-house tool that the built-in rules classify as automated.
   */
  classify?: (navigator: Navigator) => SyntheticTrafficType | "human" | undefined;
};
