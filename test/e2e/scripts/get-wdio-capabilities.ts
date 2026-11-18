import { getCapabilityNames as getBrowserCapabilityNames } from "../wdio.browsers.conf";
import { getCapabilityNames as getLambdaTestCapabilityNames } from "../wdio.lambdatest.conf";

// Prints the capability names of one wdio config as a JSON array, for the CI matrix.
// Usage: get-wdio-capabilities.ts <browsers|lambdatest>
const getCapabilityNames = { browsers: getBrowserCapabilityNames, lambdatest: getLambdaTestCapabilityNames }[
  process.argv[2] ?? ""
];
if (!getCapabilityNames) {
  console.error(`Usage: get-wdio-capabilities.ts <browsers|lambdatest>, got "${process.argv[2]}"`);
  process.exit(1);
}
console.log(JSON.stringify(getCapabilityNames()));
