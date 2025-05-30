import { perf } from "./globals";

export type TimeInput = number | Date;

export function now(): number {
  return new Date().getTime();
}

export function nowNanos(): string {
  const timeOrigin = getTimeOrigin();
  if (timeOrigin) {
    return String((perf.now() + timeOrigin) * 1000000);
  }

  return toNanosTs(new Date());
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
