/* eslint-env node */
// Guards the bundle split in both directions:
// - The session recording bundles must contain only rrweb, never SDK code. If SDK code leaked in, the
//   script-tag setup would run two copies of the SDK's singletons.
// - The main SDK bundles must not contain rrweb. A stray `import ... from "@rrweb/record"` anywhere
//   under src/ would silently ship rrweb to every user, including those who never enable recording.
import { readFileSync } from "node:fs";

const SDK_MARKERS = ["d0_session", "dash0-web-sdk", "/v1/logs"];
const RRWEB_MARKERS = ["__rrweb_original__", '"rrweb"'];

const RECORDING_BUNDLES = [
  "dist/dash0-session-recording.js",
  "dist/dash0-session-recording.umd.cjs",
  "dist/dash0-session-recording.iife.js",
];
const SDK_BUNDLES = ["dist/dash0.js", "dist/dash0.umd.cjs", "dist/dash0.iife.js"];

let failed = false;

function assertNoMarkers(files, markers, describe) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const marker of markers) {
      if (content.includes(marker)) {
        console.error(`${file} contains ${describe(marker)}`);
        failed = true;
      }
    }
  }
}

function assertHasMarkers(files, markers, describe) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const missing = markers.filter((marker) => !content.includes(marker));
    if (missing.length > 0) {
      console.error(`${file} ${describe(missing)}`);
      failed = true;
    }
  }
}

assertNoMarkers(
  RECORDING_BUNDLES,
  SDK_MARKERS,
  (marker) => `SDK code (found "${marker}"). Session recording entrypoints must only import @rrweb/record.`
);
assertNoMarkers(
  SDK_BUNDLES,
  RRWEB_MARKERS,
  (marker) =>
    `rrweb (found ${JSON.stringify(marker)}). The SDK must not import @rrweb/record; only the session recording entrypoints may.`
);
// Sanity check that the rrweb markers are still what rrweb emits. Without this, an rrweb release that
// renamed them would turn the assertion above into a silent no-op.
assertHasMarkers(
  RECORDING_BUNDLES,
  RRWEB_MARKERS,
  (missing) =>
    `no longer contains the rrweb markers ${JSON.stringify(missing)}. Update RRWEB_MARKERS in scripts/verify-bundles.mjs.`
);

if (failed) process.exit(1);
console.log("Bundle verification passed: session recording bundles contain no SDK code, SDK bundles contain no rrweb.");
