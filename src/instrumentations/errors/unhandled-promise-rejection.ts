import { setTimeout, win } from "../../utils";
import { reportUnhandledError } from "./unhandled-error";

const MESSAGE_PREFIX = "Unhandled promise rejection: ";
const STACK_UNAVAILABLE_MESSAGE = "<unavailable because Promise wasn't rejected with an Error object>";

export function startUnhandledRejectionInstrumentation() {
  if (typeof win?.addEventListener === "function") {
    win.addEventListener("unhandledrejection", onUnhandledRejection);
  }
}

export function onUnhandledRejection(event: PromiseRejectionEvent) {
  // This listener is registered at init, before the application's own listeners, and the browser runs
  // microtasks between listeners, so only a task sees whether a later listener called preventDefault().
  setTimeout(() => {
    if (!event.defaultPrevented) {
      reportRejection(event.reason);
    }
  }, 0);
}

function reportRejection(reason: unknown) {
  if (reason == null) {
    reportUnhandledError({
      message: MESSAGE_PREFIX + "<no reason defined>",
      stack: STACK_UNAVAILABLE_MESSAGE,
    });
  } else if (typeof (reason as { message?: unknown }).message === "string") {
    const error = reason as { message: string; stack?: unknown };
    reportUnhandledError({
      message: MESSAGE_PREFIX + error.message,
      stack: typeof error.stack === "string" ? error.stack : STACK_UNAVAILABLE_MESSAGE,
    });
  } else if (typeof reason !== "object") {
    reportUnhandledError({
      message: MESSAGE_PREFIX + reason,
      stack: STACK_UNAVAILABLE_MESSAGE,
    });
  }
}
