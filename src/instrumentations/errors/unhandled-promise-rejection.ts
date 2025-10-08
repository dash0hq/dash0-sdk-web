import { win } from "../../utils";
import { reportUnhandledError } from "./unhandled-error";

const MESSAGE_PREFIX = "Unhandled promise rejection: ";
const STACK_UNAVAILABLE_MESSAGE = "<unavailable because Promise wasn't rejected with an Error object>";

export function startUnhandledRejectionInstrumentation() {
  if (typeof win?.addEventListener === "function") {
    win.addEventListener("unhandledrejection", onUnhandledRejection);
  }
}

export function onUnhandledRejection(event: PromiseRejectionEvent) {
  if (event.reason == null) {
    reportUnhandledError({
      message: MESSAGE_PREFIX + "<no reason defined>",
      stack: STACK_UNAVAILABLE_MESSAGE,
    });
  } else if (typeof event.reason.message === "string") {
    reportUnhandledError({
      message: MESSAGE_PREFIX + event.reason.message,
      stack: typeof event.reason.stack === "string" ? event.reason.stack : STACK_UNAVAILABLE_MESSAGE,
    });
  } else if (typeof event.reason !== "object") {
    reportUnhandledError({
      message: MESSAGE_PREFIX + event.reason,
      stack: STACK_UNAVAILABLE_MESSAGE,
    });
  }
}
