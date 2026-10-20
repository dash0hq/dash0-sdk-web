// Asynchronous function wrapping: The process of wrapping a listener which goes into one function, e.g.
//
//  - EventTarget#addEventListener
//
// and is removed via another function, e.g.
//
//  - EventTarget#removeEventListener
//
// What is complicated about this, is that these methods identify registered listeners by function reference.
// When we wrap a function, we naturally change the reference. We must therefore keep track of which
// original function belongs to what wrapped function.
//
// This file provides helpers that help in the typical cases. It is removed from all browser specific APIs
// in order to allow simple unit test execution.
//
// Note that this file follows the behavior outlined in DOM specification. Among others, this means that it is not
// possible to register the same listener twice.
// http://dom.spec.whatwg.org
//
// The registry is consulted on every addEventListener and removeEventListener call of the page, so lookups must not
// depend on how many listeners a target already has. Wrapped listeners are therefore kept per target in maps keyed by
// event type and capture flag, and then by the original listener. The registry holds targets weakly, so it never
// keeps an otherwise unreachable target alive.

export type EventListenerOptionsOrUseCapture =
  | boolean
  | {
      capture?: boolean;
      once?: boolean;
      signal?: AbortSignal;
    };

type Listener = EventListenerOrEventListenerObject;

const registry = new WeakMap<EventTarget, Map<string, Map<Listener, Listener>>>();

/**
 * Remembers `wrappedListener` as the wrapper of `eventListener` on `target`. When the same listener is already
 * registered for the same event type and capture flag, the existing wrapper is returned instead, so the browser sees
 * the same function again and ignores the duplicate registration, as it would without wrapping.
 */
export function addWrappedDomEventListener(
  target: EventTarget,
  wrappedListener: Listener,
  eventName: string,
  eventListener: Listener,
  optionsOrCapture?: EventListenerOptionsOrUseCapture
): Listener {
  if (!target) return wrappedListener;

  let byType = registry.get(target);
  if (!byType) {
    byType = new Map();
    registry.set(target, byType);
  }

  const key = registryKey(eventName, optionsOrCapture);
  let listeners = byType.get(key);
  if (!listeners) {
    listeners = new Map();
    byType.set(key, listeners);
  }

  const existing = listeners.get(eventListener);
  if (existing) {
    // already registered. Do not allow re-registration
    return existing;
  }

  listeners.set(eventListener, wrappedListener);
  return wrappedListener;
}

/**
 * Removes and returns the wrapper of `eventListener` on `target`, or `fallback` when none is registered.
 */
export function popWrappedDomEventListener(
  target: EventTarget,
  eventName: string,
  eventListener: Listener,
  optionsOrCapture?: EventListenerOptionsOrUseCapture,
  fallback?: Listener
): Listener | undefined {
  const byType = target ? registry.get(target) : undefined;
  const key = registryKey(eventName, optionsOrCapture);
  const listeners = byType?.get(key);
  const wrapped = listeners?.get(eventListener);
  if (!wrapped) {
    return fallback;
  }

  listeners!.delete(eventListener);
  if (listeners!.size === 0) {
    byType!.delete(key);
  }
  return wrapped;
}

/**
 * Drops the registration of `eventListener` on `target`, but only while `wrappedListener` is still its wrapper.
 *
 * Used when the browser removes a listener without a removeEventListener call: after a `once` listener ran, or when
 * the `signal` it was registered with aborted. The identity check keeps a later registration of the same listener
 * intact.
 */
export function forgetWrappedDomEventListener(
  target: EventTarget,
  eventName: string,
  eventListener: Listener,
  optionsOrCapture: EventListenerOptionsOrUseCapture | undefined,
  wrappedListener: Listener
): void {
  const listeners = target ? registry.get(target)?.get(registryKey(eventName, optionsOrCapture)) : undefined;
  if (listeners?.get(eventListener) === wrappedListener) {
    popWrappedDomEventListener(target, eventName, eventListener, optionsOrCapture);
  }
}

/**
 * Test seam: the number of wrapped listeners currently registered on `target`.
 */
export function countWrappedDomEventListeners(target: EventTarget): number {
  let count = 0;
  registry.get(target)?.forEach((listeners) => (count += listeners.size));
  return count;
}

function registryKey(eventName: string, optionsOrCapture?: EventListenerOptionsOrUseCapture): string {
  return (getDomEventListenerCaptureValue(optionsOrCapture) ? "c:" : "b:") + eventName;
}

export function getDomEventListenerCaptureValue(optionsOrCapture?: EventListenerOptionsOrUseCapture): boolean {
  // > Let capture, passive, and once be the result of flattening more options.
  // https://dom.spec.whatwg.org/#dom-eventtarget-addeventlistener
  //
  // > To flatten more options, run these steps:
  // > 1. Let capture be the result of flattening options.
  // https://dom.spec.whatwg.org/#event-flatten-more
  //
  // > To flatten options, run these steps:
  // > 1. If options is a boolean, then return options.
  // > 2. Return options’s capture.
  // https://dom.spec.whatwg.org/#concept-flatten-options
  //
  // > dictionary EventListenerOptions {
  // >   boolean capture = false;
  // > };
  // https://dom.spec.whatwg.org/#dom-eventlisteneroptions-capture
  if (optionsOrCapture == null) {
    return false;
  } else if (typeof optionsOrCapture === "object") {
    return Boolean(optionsOrCapture.capture);
  }
  return Boolean(optionsOrCapture);
}
