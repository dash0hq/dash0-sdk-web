import { addEventListener } from "./listeners";
import { doc, win } from "./globals";
import { debug } from "./debug";

/**
 * Priority for callbacks that produce data, e.g. by draining their own buffer into the transport. The default.
 */
export const LAST_CHANCE_PRIORITY_PRODUCER = 0;

/**
 * Priority for transport batchers. They run after all producers, so whatever a producer emits on its way out is
 * still transmitted.
 */
export const LAST_CHANCE_PRIORITY_BATCH_FLUSH = 10;

/**
 * Priority for callbacks that send large payloads directly, bypassing the batchers. They run last: keepalive
 * requests share a body size budget, and the small batches must not lose it to a large payload.
 */
export const LAST_CHANCE_PRIORITY_LARGE_PAYLOAD = 20;

type Callback = {
  fn: () => void;
  priority: number;
};

let isUnloading = false;
let listenersRegistered = false;
const callbacks: Callback[] = [];

/**
 * Triggers the `fn` when the HTML document is getting unloaded
 * (or when it looks like it might be). Useful to flush batch activities.
 * Callbacks with a lower `priority` run first.
 */
export function onLastChance(fn: () => void, priority: number = LAST_CHANCE_PRIORITY_PRODUCER) {
  if (isUnloading) {
    fn();
  }

  if (!doc || !win) return;

  callbacks.push({ fn, priority });
  // The sort is stable, so equal priorities keep their registration order.
  callbacks.sort((a, b) => a.priority - b.priority);

  if (!listenersRegistered) {
    listenersRegistered = true;
    registerListeners(doc, win);
  }
}

function registerListeners(doc: Document, win: Window) {
  addEventListener(doc, "visibilitychange", function () {
    if (doc.visibilityState !== "visible") {
      runCallbacks();
    }
  });

  addEventListener(win, "pagehide", function () {
    isUnloading = true;
    runCallbacks();
  });

  // According to the spec visibilitychange should be a replacement for
  // beforeunload, but the reality is different (as of 2019-04-17). Chrome will
  // close tabs without firing visibilitychange. beforeunload on the other hand
  // is fired.
  addEventListener(win, "beforeunload", function () {
    isUnloading = true;
    runCallbacks();
  });
}

function runCallbacks() {
  // A copy, so a callback that registers another one does not change the iteration.
  for (const callback of callbacks.slice()) {
    // One failing callback must not keep the others, e.g. the batch flushes, from running.
    try {
      callback.fn();
    } catch (e) {
      debug("Last chance callback failed", e);
    }
  }
}
