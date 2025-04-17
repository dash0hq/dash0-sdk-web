import * as child_process from "node:child_process";

let serverProcess: child_process.ChildProcess;

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.json",

  user: process.env["SAUCE_USERNAME"],
  key: process.env["SAUCE_ACCESS_KEY"],
  // @ts-expect-error -- we currently don't validate env. Should be one of "eu" | "us"
  region: process.env["SAUCE_REGION"],
  specs: ["./spec/**/*.test.ts"],
  exclude: [
    // 'path/to/excluded/files'
  ],
  maxInstances: 1,

  // Test are generally against stable, beta, and an oldest supported version.
  // Currently somewhat arbitrarily chosen based on browserslist > 0.2% not dead on 2025-04-17
  capabilities: [
    {
      browserName: "chrome",
      browserVersion: "latest",
    },
    {
      browserName: "chrome",
      browserVersion: "beta",
    },
    {
      browserName: "chrome",
      browserVersion: "109",
      "wdio:enforceWebDriverClassic": true,
    },
    {
      browserName: "firefox",
      browserVersion: "latest",
    },
    {
      browserName: "firefox",
      browserVersion: "beta",
    },
    {
      browserName: "firefox",
      browserVersion: "115",
      "wdio:enforceWebDriverClassic": true,
    },
    {
      browserName: "microsoftedge",
      browserVersion: "latest",
    },
    {
      browserName: "microsoftedge",
      browserVersion: "beta",
    },
    {
      browserName: "microsoftedge",
      browserVersion: "133",
    },
    {
      browserName: "safari",
      browserVersion: "latest",
    },
    {
      browserName: "safari",
      browserVersion: "16",
    },
    {
      browserName: "safari",
      platformName: "iOS",
      "appium:deviceName": "iPhone Simulator",
      "appium:platformVersion": "current_major",
      "appium:automationName": "XCUITest",
    },
    {
      browserName: "safari",
      platformName: "iOS",
      "appium:deviceName": "iPhone Simulator",
      "appium:platformVersion": "16.2",
      "appium:automationName": "XCUITest",
    },
    // Android Devices seem to not work with proxied connections to localhost at the moment,
    // Information on this is unclear, so we'll avoid it for now
    // {
    //   browserName: "chrome",
    //   platformName: "android",
    //   "appium:deviceName": "Android GoogleAPI Emulator",
    //   "appium:platformVersion": "current_major",
    //   "appium:automationName": "UiAutomator2"
    // },
    // {
    //   browserName: "chrome",
    //   platformName: "android",
    //   "appium:deviceName": "Android GoogleAPI Emulator",
    //   "appium:platformVersion": "14.0",
    //   "appium:automationName": "UiAutomator2"
    // }
  ],

  logLevel: "info",
  bail: 0,
  baseUrl: "http://127.0.0.1:5001",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    [
      "sauce",
      {
        sauceConnect: true,
        sauceConnectOpts: {
          proxyLocalhost: "allow",
        },
      },
    ],
  ],

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
