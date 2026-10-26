import { SyntheticTrafficSettings, SyntheticTrafficType } from "../types/synthetic-traffic";
import { debug } from "./debug";
import { matchesAny } from "./ignore-rules";

/**
 * User agents of crawlers, link previewers and similar bots. Kept as one expression so classification is a single
 * scan of the user agent, and anchored on how bots identify themselves rather than on a list of product names:
 *
 * - A token ending in `bot`, `spider` or `crawler` directly followed by a version or variant separator:
 *   `Googlebot/2.1`, `bingbot/2.0`, `Baiduspider/2.0`, `Slackbot-LinkExpanding`. The separator matters: a word that
 *   merely ends in "bot" is not enough, so device names like `CUBOT X30` in Android user agents do not match.
 * - A `+http(s)://` contact link, the long-standing convention for crawlers to point at a page describing them.
 *   Browsers never send one.
 * - Bots that follow neither convention, listed by name.
 */
const BOT_USER_AGENT = new RegExp(
  [
    "[a-z](?:bot|spider|crawler)[/;-]",
    "\\+https?://",
    "facebookexternalhit",
    "facebookcatalog",
    "meta-external(?:agent|fetcher)",
    "(?:chatgpt|perplexity)-user",
    "(?:adsbot|apis|duplexweb|feedfetcher|mediapartners|storebot)-google",
    "google-(?:inspectiontool|read-aloud|site-verification)",
    "googleother",
    "bingpreview",
    "yahoo! slurp",
    "ia_archiver",
    "bytespider",
    "pingdom",
    "screaming frog",
    "sitebulb",
    "skypeuripreview",
  ].join("|"),
  "i"
);

/**
 * User agents and client hint brands of automated browsers: headless Chrome, test runners, and performance audits
 * (Lighthouse and PageSpeed Insights, GTmetrix, WebPageTest's `PTST` token). Their measurements describe a lab
 * setup, not users, so mixing them into real-user Web Vitals skews the numbers.
 */
const TEST_USER_AGENT = /headlesschrome|chrome-lighthouse|gtmetrix|\bptst\/|cypress|phantomjs|slimerjs/i;

type UserAgentData = { brands?: Array<{ brand?: string }> };

/**
 * Classifies the current page view as `bot`, `test`, or real-user traffic (`undefined`).
 *
 * Bots win over tests: a crawler that renders pages in headless Chrome is still a crawler. Automation is detected
 * from the user agent, the user agent client hint brands (which reveal headless Chrome even when the user agent
 * string is overridden), `navigator.webdriver` (set by every WebDriver and DevTools Protocol based tool), and the
 * globals some legacy headless browsers and test runners install.
 */
export function classifySyntheticTraffic(
  settings: SyntheticTrafficSettings,
  navigator: Navigator | undefined,
  global: unknown
): SyntheticTrafficType | undefined {
  if (!navigator) return undefined;

  if (settings.classify) {
    try {
      const custom = settings.classify(navigator);
      if (custom === "human") return undefined;
      if (custom === "bot" || custom === "test") return custom;
    } catch (e) {
      // A broken classifier must not break initialization. Fall back to the built-in rules.
      debug("syntheticTraffic.classify failed. Falling back to built-in classification.", e);
    }
  }

  const userAgent = navigator.userAgent ?? "";

  if (BOT_USER_AGENT.test(userAgent) || matchesAny(settings.botUserAgents ?? [], userAgent)) {
    return "bot";
  }

  const testUserAgents = settings.testUserAgents ?? [];
  if (TEST_USER_AGENT.test(userAgent) || matchesAny(testUserAgents, userAgent)) {
    return "test";
  }

  if (hasAutomatedBrand(navigator, testUserAgents) || navigator.webdriver === true || hasAutomationGlobal(global)) {
    return "test";
  }

  return undefined;
}

function hasAutomatedBrand(navigator: Navigator, testUserAgents: RegExp[]): boolean {
  try {
    const brands = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData?.brands;
    if (!brands) return false;
    for (let i = 0; i < brands.length; i++) {
      const brand = brands[i]?.brand;
      if (brand && (TEST_USER_AGENT.test(brand) || matchesAny(testUserAgents, brand))) {
        return true;
      }
    }
  } catch (_ignored) {
    // userAgentData is a getter in some browsers. Never let it break initialization.
  }
  return false;
}

/**
 * PhantomJS (`callPhantom`, `_phantom`), Nightmare (`__nightmare`) and Cypress (`Cypress`, set on the application
 * window under test).
 */
function hasAutomationGlobal(global: unknown): boolean {
  if (!global || typeof global !== "object") return false;
  const g = global as Record<string, unknown>;
  return g["callPhantom"] != null || g["_phantom"] != null || g["__nightmare"] != null || g["Cypress"] != null;
}
