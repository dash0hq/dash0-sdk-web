/* eslint-env node */

import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";

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
      SDK_VERSION: "TODO",
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
      name: "webVitals",
    },
    plugins: configurePlugins({ module: false }),
  },
  {
    input: "dist/modules/entrypoint/script.js",
    output: {
      format: "iife",
      file: "./dist/dash0.iife.js",
      name: "webVitals",
    },
    plugins: configurePlugins({ module: false }),
  },
];

export default configs;

// export default {
//   input: "dist/esm/src/entrypoint/script.js",
//   output: {
//     file: `dist/script/dash0.js`,
//     format: "iife",
//   },
//   // @ts-ignore
//   plugins: [
//     // secureWebVitalsLoader(),
//     replace({
//       SDK_VERSION: "TODO",
//     }),
//     nodeResolve({
//       browser: true,
//       extensions,
//     }),
//   ],
// };
