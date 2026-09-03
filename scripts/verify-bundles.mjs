/* eslint-env node */
// Guards the bundle split: the session recording bundles must contain only rrweb, never SDK code.
// If SDK code leaked in, the script-tag setup would run two copies of the SDK's singletons.
import { readFileSync } from "node:fs";

const SDK_MARKERS = ["d0_session", "dash0-web-sdk", "/v1/logs"];
const RECORDING_BUNDLES = [
  "dist/dash0-session-recording.js",
  "dist/dash0-session-recording.umd.cjs",
  "dist/dash0-session-recording.iife.js",
];

let failed = false;
for (const file of RECORDING_BUNDLES) {
  const content = readFileSync(file, "utf8");
  for (const marker of SDK_MARKERS) {
    if (content.includes(marker)) {
      console.error(
        `${file} contains SDK code (found "${marker}"). Session recording entrypoints must only import @rrweb/record.`
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Bundle verification passed: session recording bundles contain no SDK code.");
