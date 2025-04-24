/* eslint-env node */

import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import info from "./package.json" with { type: "json" };

const configurePlugins = ({ module }) => {
  return [
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
];

export default configs;
