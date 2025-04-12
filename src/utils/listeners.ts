// aliasing the global function for improved minification and
// protection against hasOwnProperty overrides.

export function addEventListener(target: EventTarget, eventType: string, callback: (arg: Event) => unknown) {
  if (target.addEventListener) {
    target.addEventListener(eventType, callback, false);
  } else if ((target as any).attachEvent) {
    (target as any).attachEvent("on" + eventType, callback);
  }
}

export function removeEventListener(target: EventTarget, eventType: string, callback: () => unknown) {
  if (target.removeEventListener) {
    target.removeEventListener(eventType, callback, false);
  } else if ((target as any).detachEvent) {
    (target as any).detachEvent("on" + eventType, callback);
  }
}
