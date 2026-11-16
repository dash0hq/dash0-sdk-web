import { LAST_CHANCE_PRIORITY_BATCH_FLUSH, onLastChance } from "../utils/on-last-chance";
import { doc } from "../utils";
import { clearTimeout, setTimeout } from "../utils/timers";
import { SendOptions } from "./fetch";

const SCHEDULE_DELAY_MILLIS = 1000;
const MAX_QUEUE_SIZE = 15;
// Items queued by `enqueue` wait for a transmission that something else causes. This bounds the memory they use
// until then. It holds a burst of console messages, which are limited to 50 per 10 seconds.
const MAX_HELD_QUEUE_SIZE = 60;
// Held items are sent after this delay when nothing else causes a transmission. The delay doubles every time it is
// what sends them, so items that are logged in reaction to each such transmission slow down instead of looping.
const MIN_HOLD_MILLIS = 10_000;
const MAX_HOLD_MILLIS = 10 * 60_000;

export type Batcher<T> = {
  send(item: T): void;

  /**
   * Queues an item without causing a transmission right away. It is sent with the next transmission, or when none
   * happens before the hold delay ends. It is dropped when too many items are waiting.
   */
  enqueue(item: T): void;
};

// Compression is asynchronous. A document that is hidden or being unloaded may be gone before `fetch()` is called.
const UNLOAD_SEND_OPTIONS: SendOptions = { compress: false };

export function newBatcher<T>(sendInternal: (items: T[], opts?: SendOptions) => void): Batcher<T> {
  const queuedItems: T[] = [];
  let pendingFlushTimeout: ReturnType<typeof setTimeout> | null;
  let pendingHoldTimeout: ReturnType<typeof setTimeout> | null;
  let holdMillis = MIN_HOLD_MILLIS;

  // We attempt batching of messages to be more efficient on the client, network and
  // server-side. While the connection is either a persistent HTTP 2 connection or
  // an HTTP 1.1 connection with keep-alive, there is still some overhead involved
  // in having many small messages.
  //
  // For this reason we attempt batching. When batching we must be careful to
  // force a transmission when the document is unloaded. The flush runs after all other
  // last chance callbacks, so items they send on their way out are part of it.
  onLastChance(() => flush(UNLOAD_SEND_OPTIONS), LAST_CHANCE_PRIORITY_BATCH_FLUSH);

  return {
    send(item: T): void {
      holdMillis = MIN_HOLD_MILLIS;

      if (isWindowHidden()) {
        // We cannot guarantee that we will ever get time to transmit data in a batched
        // format when the window is hidden, as this might occur while the document is
        // being unloaded. Immediately force a transmission in these cases.
        sendInternal([item], UNLOAD_SEND_OPTIONS);
        return;
      }

      queuedItems.push(item);
      if (queuedItems.length >= MAX_QUEUE_SIZE) {
        flush();
      } else if (pendingFlushTimeout == null) {
        pendingFlushTimeout = setTimeout(() => flush(), SCHEDULE_DELAY_MILLIS);
      }
    },

    enqueue(item: T): void {
      if (queuedItems.length < MAX_HELD_QUEUE_SIZE) {
        queuedItems.push(item);
      }
      if (pendingFlushTimeout == null && pendingHoldTimeout == null) {
        pendingHoldTimeout = setTimeout(flushHeld, holdMillis);
      }
    },
  };

  function flushHeld() {
    holdMillis = Math.min(holdMillis * 2, MAX_HOLD_MILLIS);
    flush(isWindowHidden() ? UNLOAD_SEND_OPTIONS : undefined);
  }

  function flush(opts?: SendOptions) {
    if (pendingFlushTimeout != null) {
      clearTimeout(pendingFlushTimeout);
      pendingFlushTimeout = null;
    }
    if (pendingHoldTimeout != null) {
      clearTimeout(pendingHoldTimeout);
      pendingHoldTimeout = null;
    }

    if (queuedItems.length > 0) {
      // Emptied before sending: page code that wraps `fetch` can log during the send, which queues an item.
      sendInternal(queuedItems.splice(0), opts);
    }
  }
}

function isWindowHidden() {
  return doc?.visibilityState !== "visible";
}
