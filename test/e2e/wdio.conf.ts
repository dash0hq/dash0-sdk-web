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

  capabilities: [
    // {
    //   browserName: "chrome",
    // },
    {
      browserName: "firefox",
    },
    // {
    //     browserName: 'microsoftedge'
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
