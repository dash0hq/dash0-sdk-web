import { browser } from "@wdio/globals";

export function supportsNavTimingResponseStatus() {
  const { browserName, browserVersion } = browser.capabilities;

  return browserName?.toLowerCase() !== "firefox" && parseInt(browserVersion ?? "0") > 119;
}

export function supportsLCPWebVital() {
  const { browserName, browserVersion } = browser.capabilities;

  return browserName?.toLowerCase() !== "firefox" && parseInt(browserVersion ?? "0") > 119;
}
