// aliasing the global function for improved minification and
// protection against hasOwnProperty overrides.

export function addEventListener(
  target: EventTarget,
  eventType: string,
  callback: (arg: Event) => unknown,
  capture: boolean = false
) {
  if (target.addEventListener) {
    target.addEventListener(eventType, callback, capture);
  } else if ((target as any).attachEvent) {
    // The legacy API has no capture phase. Listeners that ask for one still get registered,
    // they just observe the bubble phase.
    (target as any).attachEvent("on" + eventType, callback);
  }
}

export function removeEventListener(
  target: EventTarget,
  eventType: string,
  callback: (arg: Event) => unknown,
  capture: boolean = false
) {
  if (target.removeEventListener) {
    // The capture flag is part of a listener's identity: removal only works when it matches
    // the flag the listener was registered with.
    target.removeEventListener(eventType, callback, capture);
  } else if ((target as any).detachEvent) {
    (target as any).detachEvent("on" + eventType, callback);
  }
}
