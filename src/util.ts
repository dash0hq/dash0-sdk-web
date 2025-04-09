// aliasing the global function for improved minification and
// protection against hasOwnProperty overrides.
const globalHasOwnProperty = Object.prototype.hasOwnProperty;
export function hasOwnProperty(obj: Record<string, unknown>, key: string) {
  return globalHasOwnProperty.call(obj, key);
}

export function now(): number {
  return new Date().getTime();
}

export function noop() {
  // This function is intentionally empty.
}


export function addEventListener(target: EventTarget, eventType: string, callback: (arg: Event) => unknown) {
  if (target.addEventListener) {
    target.addEventListener(eventType, callback, false);
  } else if ((target as any).attachEvent) {
    (target as any).attachEvent('on' + eventType, callback);
  }
}

export function removeEventListener(target: EventTarget, eventType: string, callback: () => unknown) {
  if (target.removeEventListener) {
    target.removeEventListener(eventType, callback, false);
  } else if ((target as any).detachEvent) {
    (target as any).detachEvent('on' + eventType, callback);
  }
}
