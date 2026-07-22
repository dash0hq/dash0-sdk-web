import { generateUniqueId, WEB_EVENT_ID_BYTES } from "../../utils";

/**
 * The most recent user interaction, kept around briefly so that HTTP requests
 * fired in reaction to it (event handlers, framework change detection,
 * microtask-deferred XHR/fetch calls) can be attributed back to the click that
 * caused them — the same causality RUM products expose as "user actions".
 *
 * The click instrumentation registers interactions from a window-level
 * capture-phase listener, which is guaranteed to run before the application's
 * own handlers. Any span started while the interaction is active gets stamped
 * with `user_interaction.id` (and `.name` when one was derived), and the
 * `browser.interaction` event carries the same id, so the two sides can be
 * joined downstream.
 */
export type ActiveInteraction = {
  id: string;
  /** The derived action name; empty string when the click had no derivable name. */
  name: string;
  epochMillis: number;
};

/**
 * How long after a click HTTP requests are still attributed to it. Requests
 * triggered by a click are typically issued within the same task or a few
 * microtasks; the window is deliberately small so long-lived polling or timers
 * are not misattributed to a stale click.
 */
const ACTIVE_INTERACTION_WINDOW_MILLIS = 2000;

let active: ActiveInteraction | undefined;

export function registerActiveInteraction(name: string): ActiveInteraction {
  active = {
    id: generateUniqueId(WEB_EVENT_ID_BYTES),
    name,
    epochMillis: Date.now(),
  };
  return active;
}

export function getActiveInteraction(): ActiveInteraction | undefined {
  if (!active) return undefined;
  if (Date.now() - active.epochMillis > ACTIVE_INTERACTION_WINDOW_MILLIS) {
    active = undefined;
    return undefined;
  }
  return active;
}

export function clearActiveInteractionForTests(): void {
  active = undefined;
}
