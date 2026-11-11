import { noop } from "./fn";

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevel = keyof typeof logLevels;

let activeLogLevel: number = logLevels.warn;

let internalLoggingDepth = 0;

/**
 * True while the SDK writes one of its own messages to the console. The console instrumentation must not capture
 * these: the SDK reports failed transmissions through this logger, so capturing them would feed every failure back
 * into the transport.
 */
export function isLoggingInternally(): boolean {
  return internalLoggingDepth > 0;
}

/**
 * Changes the logging verbosity of Dash0's web SDK. By default, only warnings and errors are logged.
 */
export function setActiveLogLevel(level: LogLevel) {
  activeLogLevel = logLevels[level] ?? logLevels.warn;
}

type Logger = (...args: any[]) => void;

export const info: Logger = createLogger("info");
export const warn: Logger = createLogger("warn");
export const error: Logger = createLogger("error");
export const debug: Logger = createLogger("debug");

function createLogger(logLevel: LogLevel): Logger {
  if (typeof console !== "undefined" && console[logLevel] && typeof console[logLevel].apply === "function") {
    const numericLogLevel = logLevels[logLevel];

    return function () {
      if (numericLogLevel >= activeLogLevel) {
        internalLoggingDepth++;
        try {
          console[logLevel].apply(console, arguments as any);
        } finally {
          internalLoggingDepth--;
        }
      }
    };
  }

  return noop;
}
