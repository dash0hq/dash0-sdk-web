import { vars } from "../../vars";
import { isRunningZoneJs } from "../../utils/timers";
import { warn, win } from "../../utils";
import { ignoreNextOnErrorEvent } from "./unhandled-error";

export function startTimerInstrumentation() {
  if (vars.wrapTimers) {
    if (isRunningZoneJs) {
      warn(
        "We discovered a usage of Zone.js. In order to avoid any incompatibility issues timer wrapping is not going to be enabled."
      );
      return;
    }
    wrapTimer("setTimeout");
    wrapTimer("setInterval");
  }
}

function wrapTimer(name: "setTimeout" | "setInterval") {
  const original = win[name];
  if (typeof original !== "function") {
    // cannot wrap because fn is not a function – should actually never happen
    return;
  }

  (win as any)[name] = function wrappedTimerSetter(fn: TimerHandler): ReturnType<(typeof win)[typeof name]> {
    // non-deopt arguments copy
    const args = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }
    args[0] = wrap(fn);
    return original.apply(this, args as any);
  };
}

function wrap(fn: TimerHandler) {
  if (typeof fn !== "function") {
    // cannot wrap because fn is not a function
    return fn;
  }

  return function wrappedTimerHandler(this: any) {
    try {
      return fn.apply(this, arguments);
    } catch (e) {
      reportError(e as any);
      ignoreNextOnErrorEvent();
      throw e;
    }
  };
}
