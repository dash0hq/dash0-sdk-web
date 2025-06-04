import * as child_process from "node:child_process";

let serverProcess: child_process.ChildProcess;

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.json",

  specs: ["./spec/**/*.test.ts"],
  exclude: [
    // 'path/to/excluded/files'
  ],
  maxInstances: 1,

  // Configuration for local headless Chrome
  capabilities: [
    {
      browserName: "chrome",
      acceptInsecureCerts: true,
      "goog:chromeOptions": {
        args: ["--headless", "--disable-gpu", "--no-sandbox"],
      },
    },
  ],

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
      }, 2000); // Added timeout to ensure server starts
    });
  },

  onComplete: function () {
    serverProcess.kill();
  },
};
