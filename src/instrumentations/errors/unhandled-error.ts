import { KeyValue, LogRecord } from "../../../types/otlp";
import { hasOwnProperty, nowNanos, win } from "../../utils";
import { ErrorLike, ReportErrorOpts } from "../../../types/errors";
import { isErrorMessageIgnored } from "../../utils/ignore-rules";
import { sendLog } from "../../transport";
import {
  EVENT_NAME,
  EVENT_NAMES,
  EXCEPTION_COMPONENT_STACK,
  EXCEPTION_MESSAGE,
  EXCEPTION_STACKTRACE,
  EXCEPTION_TYPE,
  LOG_SEVERITIES,
} from "../../semantic-conventions";
import { addAttribute } from "../../utils/otel";
import { addCommonAttributes } from "../../attributes";

type TrackedError = {
  seenCount: number;
  transmittedCount: number;
  log: LogRecord;
};

const MAX_ERRORS_TO_REPORT = 100;
const MAX_STACK_SIZE = 30;
const MAX_NUMBER_OF_TRACKED_ERRORS = 20;

let reportedErrors = 0;
let numberOfDifferentErrorsSeen = 0;
let seenErrors: { [key: string]: TrackedError } = {};
let scheduledTransmissionTimeoutHandle: ReturnType<typeof setTimeout> | null;

// We are wrapping global listeners. In these, we are catching and rethrowing errors.
// In older browsers, rethrowing errors actually manipulates the error objects. As a
// result, it is not possible to just mark an error as reported. The simplest way to
// avoid double reporting is to temporarily disable the global onError handler…
let ignoreNextOnError = false;

export function ignoreNextOnErrorEvent() {
  ignoreNextOnError = true;
}

export function startOnErrorInstrumentation() {
  if (!win) return;

  const globalOnError = win.onerror;

  win.onerror = function (
    message: string | Event,
    fileName?: string,
    lineNumber?: number,
    columnNumber?: number,
    error?: any
  ) {
    if (ignoreNextOnError as boolean) {
      ignoreNextOnError = false;
      if (typeof globalOnError === "function") {
        return globalOnError.apply(this, arguments as any);
      }
      return;
    }

    let stack = error && error.stack;
    if (!stack) {
      stack = "at " + fileName + " " + lineNumber;
      if (columnNumber != null) {
        stack += ":" + columnNumber;
      }
    }
    onUnhandledError({ message: String(message), stack });

    if (typeof globalOnError === "function") {
      return globalOnError.apply(this, arguments as any);
    }
  };
}

export function reportError(error: string | ErrorLike, opts?: ReportErrorOpts) {
  if (!error) {
    return;
  }

  if (typeof error === "string") {
    onUnhandledError({ message: error, opts });
  } else {
    onUnhandledError({ message: error.message, type: error.name, stack: error.stack, opts });
  }
}

type UnhandledErrorArgs = {
  message: string;
  type?: string;
  stack?: string;
  opts?: ReportErrorOpts;
};

function onUnhandledError({ message, type, stack, opts }: UnhandledErrorArgs) {
  if (!message || reportedErrors > MAX_ERRORS_TO_REPORT) {
    return;
  }

  if (isErrorMessageIgnored(message)) {
    return;
  }

  if (numberOfDifferentErrorsSeen >= MAX_NUMBER_OF_TRACKED_ERRORS) {
    seenErrors = {};
    numberOfDifferentErrorsSeen = 0;
  }

  message = String(message).substring(0, 300);
  stack = shortenStackTrace(stack);
  const location = win?.location.href;
  const key = message + stack + location;

  let trackedError = seenErrors[key];
  if (trackedError) {
    trackedError.seenCount++;
  } else {
    const attributes: KeyValue[] = [];
    addAttribute(attributes, EVENT_NAME, EVENT_NAMES.ERROR);
    addAttribute(attributes, EXCEPTION_MESSAGE, message);
    if (type) {
      addAttribute(attributes, EXCEPTION_TYPE, type);
    }
    if (stack) {
      addAttribute(attributes, EXCEPTION_STACKTRACE, stack);
    }
    if (opts?.componentStack) {
      addAttribute(attributes, EXCEPTION_COMPONENT_STACK, opts?.componentStack.substring(0, 2048));
    }
    addCommonAttributes(attributes);

    trackedError = {
      seenCount: 1,
      transmittedCount: 0,
      log: {
        timeUnixNano: nowNanos(),
        attributes: attributes,
        severityNumber: LOG_SEVERITIES.ERROR,
        severityText: "ERROR",
        body: {
          stringValue: message,
        },
      },
    };
    seenErrors[key as string] = trackedError;

    numberOfDifferentErrorsSeen++;
  }

  scheduleTransmission();
}

export function shortenStackTrace(stack?: string): string {
  return String(stack || "")
    .split("\n")
    .slice(0, MAX_STACK_SIZE)
    .join("\n");
}

function scheduleTransmission() {
  if (scheduledTransmissionTimeoutHandle) {
    return;
  }
  scheduledTransmissionTimeoutHandle = setTimeout(send, 1000);
}

function send() {
  if (scheduledTransmissionTimeoutHandle) {
    clearTimeout(scheduledTransmissionTimeoutHandle);
    scheduledTransmissionTimeoutHandle = null;
  }

  for (const key in seenErrors) {
    if (hasOwnProperty(seenErrors, key)) {
      const seenError = seenErrors[key]!;
      if (seenError.seenCount > seenError.transmittedCount) {
        sendLog(seenError.log);
        reportedErrors++;
      }
    }
  }

  seenErrors = {};
  numberOfDifferentErrorsSeen = 0;
}
