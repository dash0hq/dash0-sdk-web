/* eslint-env node */

import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import info from "./package.json" with { type: "json" };

const configurePlugins = ({ module, transpile = true }) => {
  return [
    // The session recording bundles skip babel: rrweb requires Proxy and MutationObserver, so an IE 11 target
    // buys nothing and transpiling to ES5 roughly doubles the bundle. rrweb's own build targets ES2015+,
    // which every browser in the e2e baseline supports.
    ...(transpile
      ? [
          babel({
            babelHelpers: "bundled",
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: {
                    browsers: ["ie 11"],
                  },
                },
              ],
            ],
          }),
        ]
      : []),
    replace({
      __sdkVersion: JSON.stringify(info.version),
      preventAssignment: true,
    }),
    nodeResolve({
      browser: true,
    }),
    terser({
      module,
      mangle: true,
      compress: true,
    }),
  ];
};

const configs = [
  {
    input: "dist/modules/entrypoint/npm-package.js",
    output: {
      format: "esm",
      file: "./dist/dash0.js",
    },
    plugins: configurePlugins({ module: true }),
  },
  {
    input: "dist/modules/entrypoint/npm-package.js",
    output: {
      format: "umd",
      file: `./dist/dash0.umd.cjs`,
      name: "dash0",
    },
    plugins: configurePlugins({ module: false }),
  },
  {
    input: "dist/modules/entrypoint/script.js",
    output: {
      format: "iife",
      file: "./dist/dash0.iife.js",
      name: "dash0",
    },
    plugins: configurePlugins({ module: false }),
  },
  {
    input: "dist/modules/entrypoint/session-recording.js",
    output: {
      format: "esm",
      file: "./dist/dash0-session-recording.js",
    },
    plugins: configurePlugins({ module: true, transpile: false }),
  },
  {
    input: "dist/modules/entrypoint/session-recording.js",
    output: {
      format: "umd",
      file: "./dist/dash0-session-recording.umd.cjs",
      name: "dash0SessionRecording",
    },
    plugins: configurePlugins({ module: false, transpile: false }),
  },
  {
    input: "dist/modules/entrypoint/session-recording-script.js",
    output: {
      format: "iife",
      file: "./dist/dash0-session-recording.iife.js",
      name: "dash0SessionRecording",
    },
    plugins: configurePlugins({ module: false, transpile: false }),
  },
];

export default configs;
