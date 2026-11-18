import * as child_process from "node:child_process";
import * as process from "node:process";
import { type CapabilityConfig, getEnabledCapabilityNames, getSelectedCapabilities } from "./capabilities";

let serverProcess: child_process.ChildProcess;

// Headless browsers that run directly on the machine, without LambdaTest. Tests are generally against
// stable, beta, and an oldest supported version.
//
// test/e2e/scripts/install-browser.sh downloads the browser for the selected capability and sets
// BROWSER_BINARY and BROWSER_VERSION. WebdriverIO uses BROWSER_VERSION to download the matching driver. Firefox
// gets no browserVersion, because WebdriverIO would use it as the geckodriver version.
const binary = process.env["BROWSER_BINARY"];
const browserVersion = process.env["BROWSER_VERSION"];

const allCapabilities: Record<string, CapabilityConfig> = {
  "chrome-latest": {
    browserName: "chrome",
    browserVersion,
    "goog:chromeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
  "chrome-beta": {
    browserName: "chrome",
    browserVersion,
    "goog:chromeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
  "chrome-baseline": {
    browserName: "chrome",
    browserVersion,
    "goog:chromeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
  "firefox-latest": {
    browserName: "firefox",
    "moz:firefoxOptions": { binary, args: ["-headless"] },
  },
  "firefox-beta": {
    browserName: "firefox",
    "moz:firefoxOptions": { binary, args: ["-headless"] },
  },
  "firefox-baseline": {
    browserName: "firefox",
    "moz:firefoxOptions": { binary, args: ["-headless"] },
  },
  "edge-latest": {
    browserName: "microsoftedge",
    browserVersion,
    "ms:edgeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
  "edge-beta": {
    browserName: "microsoftedge",
    browserVersion,
    "ms:edgeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
  "edge-baseline": {
    browserName: "microsoftedge",
    browserVersion,
    "ms:edgeOptions": { binary, args: ["--headless", "--disable-gpu", "--no-sandbox"] },
  },
};

export function getCapabilityNames() {
  return getEnabledCapabilityNames(allCapabilities);
}

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.json",

  specs: ["./spec/**/*.test.ts"],
  exclude: [
    // 'path/to/excluded/files'
  ],
  maxInstances: 1,

  capabilities: getSelectedCapabilities(allCapabilities),

  logLevel: "info",
  bail: 0,
  baseUrl: "http://127.0.0.1:8011",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: "mocha",

  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  onPrepare: function (config, capabilities) {
    return new Promise<void>((resolve) => {
      serverProcess = child_process.fork("./test/e2e/server/index.mjs", {
        stdio: "inherit",
        env: {
          ...process.env,
          SERVER_PORTS: "8010,8011,8012",
        },
      });

      // Wait for server to be ready
      setTimeout(() => {
        resolve();
      }, 2000);
    });
  },

  onComplete: function () {
    serverProcess.kill();
  },
};
