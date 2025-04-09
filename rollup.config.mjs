/* eslint-env node */

import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

const extensions = [".js"];

// const secureWebVitalsLoader = require('./secureWebVitalsLoader');

// const isDebugBuild = process.env.NODE_ENV !== 'production';

export default {
  input: "dist/esm/entrypoint/script-tag.js",
  output: {
    file: `dist/script/dash0.js`,
    sourcemap: true,
    format: "iife",
  },
  // @ts-ignore
  plugins: [
    // secureWebVitalsLoader(),
    replace({
      SDK_VERSION: "TODO",
    }),
    nodeResolve({
      browser: true,
      extensions,
    }),
  ],
};
