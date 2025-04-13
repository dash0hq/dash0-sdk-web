import { noop } from "./fn";

type Logger = (...args: any[]) => void;

export const log: Logger = createLogger("log");
export const info: Logger = createLogger("info");
export const warn: Logger = createLogger("warn");
export const error: Logger = createLogger("error");
export const debug: Logger = createLogger("debug");

function createLogger(method: Extract<keyof Console, "log" | "info" | "warn" | "error" | "debug">): Logger {
  if (typeof console === "undefined" || typeof console.log !== "function" || typeof console.log.apply !== "function") {
    return noop;
  }

  if (console[method] && typeof console[method].apply === "function") {
    return function () {
      console[method].apply(console, arguments as any);
    };
  }

  return function () {
    console.log.apply(console, arguments as any);
  };
}
