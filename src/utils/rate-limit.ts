import { setInterval } from "./timers";

export function createRateLimiter(opts: { maxCallsPerTenMinutes: number; maxCallsPerTenSeconds: number }) {
  const maxCallsPerTenMinutes = opts.maxCallsPerTenMinutes || 128;
  const maxCallsPerTenSeconds = opts.maxCallsPerTenSeconds || 32;

  let totalCallsInLastTenMinutes = 0;
  let totalCallsInLastTenSeconds = 0;

  setInterval(
    function () {
      totalCallsInLastTenMinutes = 0;
    },
    1000 * 60 * 10
  );

  setInterval(function () {
    totalCallsInLastTenSeconds = 0;
  }, 1000 * 10);

  return function isExcessiveUsage() {
    return ++totalCallsInLastTenMinutes > maxCallsPerTenMinutes || ++totalCallsInLastTenSeconds > maxCallsPerTenSeconds;
  };
}
