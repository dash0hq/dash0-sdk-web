import { vars } from "../../vars";
import { win, WindowType } from "../../utils";
import {
  addWrappedDomEventListener,
  EventListenerOptionsOrUseCapture,
  forgetWrappedDomEventListener,
  popWrappedDomEventListener,
} from "./async-function-wrapping";
import { ignoreNextOnErrorEvent, reportUnhandledError } from "./unhandled-error";

export function startEventHandlerInstrumentation() {
  if (vars.wrapEventHandlers) {
    wrapEventTarget(win?.EventTarget);
  }
}

/**
 * Exported for tests only.
 */
export function wrapEventTarget(EventTarget: WindowType["EventTarget"] | undefined) {
  if (
    !EventTarget ||
    typeof EventTarget.prototype.addEventListener !== "function" ||
    typeof EventTarget.prototype.removeEventListener !== "function"
  ) {
    return;
  }

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function wrappedAddEventListener(
    eventName: string,
    fn: EventListenerOrEventListenerObject | null,
    optionsOrCapture?: EventListenerOptionsOrUseCapture
  ) {
    if (typeof fn !== "function") {
      return originalAddEventListener.apply(this, arguments as any);
    }

    const options = typeof optionsOrCapture === "object" && optionsOrCapture !== null ? optionsOrCapture : undefined;
    const signal = options?.signal;
    if (signal?.aborted) {
      // The browser does not register a listener for an aborted signal, so there is nothing to remember.
      return originalAddEventListener.apply(this, arguments as any);
    }

    // A bare `addEventListener(...)` call runs with an undefined `this` and registers on the global object.
    const target: EventTarget = this ?? (win as unknown as EventTarget);

    // non-deopt arguments copy
    const args = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    const once = Boolean(options?.once);
    const wrapped = function wrappedEventListener(this: any) {
      if (once) {
        // The browser removed the listener before invoking it. Without this it would stay in the registry forever.
        forgetWrappedDomEventListener(target, eventName, fn, optionsOrCapture, wrapped);
      }
      try {
        return fn.apply(this, arguments as any);
      } catch (e) {
        reportUnhandledError(e as any);
        ignoreNextOnErrorEvent();
        throw e;
      }
    };

    // Aborting the signal removes the listener without a removeEventListener call. The abort handler is registered on
    // the unwrapped method so that it does not end up in the registry itself, and is removed again when the
    // registration ends otherwise, so that a long-lived signal does not keep the target and listener reachable.
    const onAbort = () => forgetWrappedDomEventListener(target, eventName, fn, optionsOrCapture, wrapped);
    const release = signal ? () => originalRemoveEventListener.call(signal, "abort", onAbort) : undefined;
    args[1] = addWrappedDomEventListener(target, wrapped, eventName, fn, optionsOrCapture, release);

    if (signal && args[1] === wrapped) {
      originalAddEventListener.call(signal, "abort", onAbort, { once: true });
    }

    return originalAddEventListener.apply(this, args as any);
  };

  EventTarget.prototype.removeEventListener = function wrappedRemoveEventListener(
    eventName: string,
    fn: EventListenerOrEventListenerObject | null,
    optionsOrCapture?: EventListenerOptionsOrUseCapture
  ) {
    if (typeof fn !== "function") {
      return originalRemoveEventListener.apply(this, arguments as any);
    }

    // non-deopt arguments copy
    const args = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    const target: EventTarget = this ?? (win as unknown as EventTarget);
    args[1] = popWrappedDomEventListener(target, eventName, fn, optionsOrCapture, fn);

    return originalRemoveEventListener.apply(this, args as any);
  };
}
