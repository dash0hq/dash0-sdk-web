import { startOnErrorInstrumentation } from "./unhandled-error";
import { startUnhandledRejectionInstrumentation } from "./unhandled-promise-rejection";
import { startEventHandlerInstrumentation } from "./event-handlers";
import { startTimerInstrumentation } from "./timers";

export function startErrorInstrumentation() {
  startOnErrorInstrumentation();
  startUnhandledRejectionInstrumentation();
  startEventHandlerInstrumentation();
  startTimerInstrumentation();
}
