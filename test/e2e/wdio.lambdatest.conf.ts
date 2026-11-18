import * as child_process from "node:child_process";
import * as process from "node:process";
import { type CapabilityConfig, getEnabledCapabilityNames, getSelectedCapabilities } from "./capabilities";

let serverProcess: child_process.ChildProcess;

// Chrome, Firefox and Edge run directly on the CI runner (see wdio.browsers.conf.ts). LambdaTest is
// only used for browsers that cannot run there: Safari on macOS, and mobile browsers.
const allCapabilities: Record<string, CapabilityConfig> = {
  "safari-latest": {
    browserName: "safari",
    browserVersion: "latest",
  },
  "safari-baseline": {
    browserName: "safari",
    browserVersion: "16",
  },
  "safari-ios-latest": {
    browserName: "safari",
    platformName: "iOS",
    "appium:deviceName": "iPhone Simulator",
    "appium:platformVersion": "current_major",
    "appium:automationName": "XCUITest",
    enabled: false,
  },
  "safari-ios-baseline": {
    browserName: "safari",
    platformName: "iOS",
    "appium:deviceName": "iPhone Simulator",
    "appium:platformVersion": "16.2",
    "appium:automationName": "XCUITest",
    enabled: false,
  },
  // Android Devices seem to not work with proxied connections to localhost at the moment,
  // Information on this is unclear, so we'll disable them for now.
  "chrome-android-latest": {
    browserName: "chrome",
    platformName: "android",
    "appium:deviceName": "Android GoogleAPI Emulator",
    "appium:platformVersion": "current_major",
    "appium:automationName": "UiAutomator2",
    enabled: false,
  },
  "chrome-android-baseline": {
    browserName: "chrome",
    platformName: "android",
    "appium:deviceName": "Android GoogleAPI Emulator",
    "appium:platformVersion": "14.0",
    "appium:automationName": "UiAutomator2",
    enabled: false,
  },
};

export function getCapabilityNames() {
  return getEnabledCapabilityNames(allCapabilities);
}

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.json",

  user: process.env["LT_USERNAME"],
  key: process.env["LT_ACCESS_KEY"],
  specs: ["./spec/**/*.test.ts"],
  exclude: [
    // 'path/to/excluded/files'
  ],
  maxInstances: 1,

  capabilities: getSelectedCapabilities(allCapabilities),

  logLevel: "info",
  bail: 0,
  baseUrl: "http://localhost.lambdatest.com:8011",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // LambdaTest intermittently times out the new-session POST to its hub (a tunnel/capacity hiccup, not a
  // product failure). That aborts session creation before any test runs, so neither connectionRetryCount
  // (command-level) nor mochaOpts.retries (test-level, needs a live session) can recover it — the worker
  // dies with an "isMultiremote" TypeError. specFileRetries re-runs the whole spec file with a fresh
  // session, which clears these session-creation flakes; a genuine product break still fails every attempt.
  specFileRetries: 2,
  specFileRetriesDelay: 5,
  specFileRetriesDeferred: true,

  services: [
    ["lambdatest", { tunnel: true, sessionNameOmitTestTitle: true, sessionNamePrependTopLevelSuiteTitle: true }],
  ],
  // @ts-expect-error -- this is not inluded in the type, but required for lambdatest
  product: "appAutomation",

  framework: "mocha",

  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
    // Safari on LambdaTest has an irreducible nondeterminism where the *first* user-gesture action
    // of a browser session occasionally does not connect to the (fully initialized) SDK, so its
    // telemetry is lost. loadPage() waits for the SDK pipeline to be live which removes most of it,
    // but not all. A retried test re-runs as a later (warm) action in the same session and passes,
    // so retries close the residual gap without masking real product failures (a genuine break fails
    // every attempt).
    retries: 2,
  },

  onPrepare: function (config, capabilities) {
    return new Promise<void>((resolve) => {
      serverProcess = child_process.fork("./test/e2e/server/index.mjs", {
        stdio: "inherit",
        env: {
          ...process.env,
          SERVER_PORTS: "8010,8011,8012",
          SERVER_BASE_URL: config.baseUrl,
        },
      });

      // Wait for server to be ready
      setTimeout(() => {
        resolve();
      });
    });
  },

  onComplete: function () {
    serverProcess.kill();
  },
};
