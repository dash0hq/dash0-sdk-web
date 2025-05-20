import * as child_process from "node:child_process";
import * as process from "node:process";

let serverProcess: child_process.ChildProcess;

type CapabilityConfig = WebdriverIO.Config["capabilities"][number] & {
  enabled?: boolean;
};

// Test are generally against stable, beta, and an oldest supported version.
// Currently somewhat arbitrarily chosen based on what works with wdio/lambdatest without horribly exploding
const allCapabilitities: Record<string, CapabilityConfig> = {
  "chrome-latest": {
    browserName: "chrome",
    browserVersion: "latest",
  },
  "chrome-beta": {
    browserName: "chrome",
    browserVersion: "beta",
  },
  "chrome-baseline": {
    browserName: "chrome",
    browserVersion: "128",
  },
  "firefox-latest": {
    browserName: "firefox",
    browserVersion: "latest",
  },
  "firefox-beta": {
    browserName: "firefox",
    browserVersion: "beta",
  },
  "firefox-baseline": {
    browserName: "firefox",
    browserVersion: "119",
  },
  "edge-latest": {
    browserName: "microsoftedge",
    browserVersion: "latest",
  },
  "edge-beta": {
    browserName: "microsoftedge",
    browserVersion: "beta",
  },
  "edge-baseline": {
    browserName: "microsoftedge",
    browserVersion: "133",
  },
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
  return Object.entries(allCapabilitities)
    .filter(([_, value]) => value.enabled !== false)
    .map(([key]) => key);
}

function getSelectedCapabilities() {
  const selected = (process.env["WDIO_SELECTED_CAPABILITIES"] ?? "").split(",");

  if (!selected.length || selected[0] === "") {
    selected.push(...Object.keys(allCapabilitities));
  }

  return Object.entries(allCapabilitities)
    .filter(([_, value]) => value.enabled !== false)
    .filter(([key]) => selected.includes(key))
    .map(([_, value]) => value);
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

  capabilities: getSelectedCapabilities(),

  logLevel: "info",
  bail: 0,
  baseUrl: "http://localhost.lambdatest.com:5001",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

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
  },

  onPrepare: function (config, capabilities) {
    return new Promise<void>((resolve) => {
      serverProcess = child_process.fork("./test/e2e/server/index.mjs", {
        stdio: "inherit",
        env: {
          ...process.env,
          SERVER_PORTS: "5000,5001,5002",
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
