import { perf } from "./performance";

export function now(): number {
  return new Date().getTime();
}

export function nowNanos(): string {
  const timeOrigin = getTimeOrigin();
  if (timeOrigin) {
    return String((perf.now() + timeOrigin) * 1000000);
  }

  // We don't multiply, because we want to keep number precision
  return String(new Date().getTime()) + "000000";
}

export function getTimeOrigin(): number {
  let timeOrigin = perf?.timeOrigin;
  if (typeof timeOrigin !== "number") {
    timeOrigin = perf?.timing?.fetchStart;
  }
  return timeOrigin;
}
