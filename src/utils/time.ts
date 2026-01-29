import { perf } from "./globals";

export type TimeInput = number | Date;

export function now(): number {
  return new Date().getTime();
}

export function nowNanos(): string {
  const timeOrigin = getTimeOrigin();
  const currentDate = new Date();

  if (timeOrigin) {
    const perfTime = perf.now() + timeOrigin;
    const dateTime = currentDate.getTime();

    // Only return perf time measurement if it hasn't significantly drifted (60s).
    // Some browsers violate the performance api spec and do not tick the monotonic time while the OS sleeps or the browser hangs
    // See https://bugzil.la/1709767
    // See https://webkit.org/b/225610
    if (Math.abs(perfTime - dateTime) < 60000) {
      return String(perfTime * 1000000);
    }
  }

  return toNanosTs(currentDate);
}

export function toNanosTs(time: TimeInput): string {
  if (typeof time === "object") {
    return toNanosTs(time.getTime());
  }

  // We don't multiply, because we want to keep number precision
  return String(time) + "000000";
}

export function getTimeOrigin(): number {
  let timeOrigin = perf?.timeOrigin;
  if (typeof timeOrigin !== "number") {
    timeOrigin = perf?.timing?.fetchStart;
  }
  return timeOrigin;
}

export function domHRTimestampToNanos(ts: number): string {
  return String(Math.round((ts + getTimeOrigin()) * 1000000));
}
