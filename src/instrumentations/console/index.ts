import {
  CODE_STACKTRACE,
  CONSOLE_METHOD,
  EVENT_NAME,
  EVENT_NAMES,
  EXCEPTION_MESSAGE,
  EXCEPTION_STACKTRACE,
  EXCEPTION_TYPE,
  LOG_SEVERITIES,
  LOG_SEVERITY_TEXT,
} from "../../semantic-conventions";
import { addCommonAttributes, scrubPageUrls } from "../../attributes";
import { sendConsoleLog } from "../../transport";
import { addAttribute } from "../../utils/otel";
import { createRateLimiter, debug, isLoggingInternally, nowNanos, win, wrap } from "../../utils";
import { isUrlIgnored, matchesAny } from "../../utils/ignore-rules";
import { shortenStackTrace } from "../errors/unhandled-error";
import { vars } from "../../vars";
import { KeyValue } from "../../types/otlp";
import { ConsoleMethod } from "../../types/console";
import { formatConsoleArgs, isError } from "./format";

export const DEFAULT_CONSOLE_LEVELS: ConsoleMethod[] = ["warn", "error"];
export const DEFAULT_MAX_CONSOLE_MESSAGE_LENGTH = 4096;

const SEVERITIES: Record<ConsoleMethod, LOG_SEVERITY_TEXT> = {
  trace: "DEBUG",
  debug: "DEBUG",
  log: "INFO",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

let started = false;
let isExcessiveUsage: () => boolean;

/**
 * Re-entry guard. Formatting reads getters and calls `toString()` on the logged values, which may log themselves.
 */
let capturing = false;

/**
 * Wraps the console methods listed in `consoleLogs.levels` and sends every message logged through them as a
 * `browser.console` event. The original method is always called, with the original arguments.
 */
export function startConsoleInstrumentation(): void {
  if (started || typeof console === "undefined") return;
  started = true;

  // A page logging in a render or animation loop would otherwise fill the session. Messages beyond the budget are
  // dropped before they are formatted, so an over-budget page pays only for the check.
  isExcessiveUsage = createRateLimiter({ maxCallsPerTenMinutes: 1000, maxCallsPerTenSeconds: 50 });

  const levels = vars.consoleLogs.levels ?? DEFAULT_CONSOLE_LEVELS;
  for (let i = 0; i < levels.length; i++) {
    const method = levels[i]!;
    if (!(method in SEVERITIES)) {
      debug(`Unknown console level ${method}, not capturing it`);
      continue;
    }

    wrap(console, method, (original) => {
      if (typeof original !== "function") return original;

      return function (this: unknown) {
        // Created here, so that the first frame below the header is this wrapper and the next one the caller.
        const stack = method === "trace" ? new Error().stack : undefined;

        if (!capturing && !isLoggingInternally()) {
          capturing = true;
          try {
            onConsoleCall(method, arguments, stack);
          } catch (e) {
            debug("Failed to capture console message", e);
          } finally {
            capturing = false;
          }
        }

        return original.apply(this, arguments as any);
      } as typeof original;
    });
  }
}

function onConsoleCall(method: ConsoleMethod, args: IArguments, stack: string | undefined): void {
  if (!vars.isSessionSampled || args.length === 0) return;
  if (win && isUrlIgnored(win.location.href)) return;
  if (isExcessiveUsage()) return;

  const maxLength = vars.consoleLogs.maxMessageLength ?? DEFAULT_MAX_CONSOLE_MESSAGE_LENGTH;
  const message = scrubPageUrls(formatConsoleArgs(args, maxLength));
  if (!message || matchesAny(vars.consoleLogs.ignoreMessages ?? [], message)) return;

  const attributes: KeyValue[] = [];
  addCommonAttributes(attributes);
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.CONSOLE);
  addAttribute(attributes, CONSOLE_METHOD, method);

  const error = findError(args);
  if (error) {
    addAttribute(attributes, EXCEPTION_TYPE, error.name || "Error");
    if (error.message) {
      addAttribute(attributes, EXCEPTION_MESSAGE, scrubPageUrls(String(error.message)).substring(0, maxLength));
    }
    if (error.stack) {
      addAttribute(attributes, EXCEPTION_STACKTRACE, scrubPageUrls(shortenStackTrace(error.stack)));
    }
  }

  const callerStack = stack && dropOwnFrames(stack);
  if (callerStack) {
    addAttribute(attributes, CODE_STACKTRACE, scrubPageUrls(shortenStackTrace(callerStack)));
  }

  const severity = SEVERITIES[method];
  sendConsoleLog({
    timeUnixNano: nowNanos(),
    attributes,
    severityNumber: LOG_SEVERITIES[severity],
    severityText: severity,
    body: { stringValue: message },
  });
}

function findError(args: IArguments): Error | undefined {
  for (let i = 0; i < args.length; i++) {
    if (isError(args[i])) return args[i];
  }
  return undefined;
}

/**
 * Removes the error header line that V8 adds, and the frame of the console wrapper. Firefox and Safari start
 * directly with the first frame.
 */
function dropOwnFrames(stack: string): string {
  const lines = stack.split("\n");
  const start = /^\s*at\s|@/.test(lines[0] ?? "") ? 1 : 2;
  return lines.slice(start).join("\n");
}
