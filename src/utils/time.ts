import { win } from "./globals";

export function now(): number {
  return new Date().getTime();
}

export function nowNanos(): string {
  const timeOrigin = getTimeOrigin();
  if (timeOrigin) {
    return String(win.performance.now() + timeOrigin);
  }

  // We don't multiply, because we want to keep number precision
  return String(new Date().getTime()) + "000000";
}

export function getTimeOrigin(): number {
  let timeOrigin = win.performance.timeOrigin;
  if (typeof timeOrigin !== "number") {
    timeOrigin = win.performance.timing?.fetchStart;
  }
  return timeOrigin;
}
