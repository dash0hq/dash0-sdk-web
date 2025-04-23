import { onLastChance } from "../utils/on-last-chance";
import { doc } from "../utils";
import { setTimeout } from "../utils/timers";

const SCHEDULE_DELAY_MILLIS = 1000;
const MAX_QUEUE_SIZE = 15;

export type Batcher<T> = {
  send(item: T): void;
};

export function newBatcher<T>(sendInternal: (items: T[]) => void): Batcher<T> {
  const queuedItems: T[] = [];
  let pendingFlushTimeout: ReturnType<typeof setTimeout> | null;

  // We attempt batching of messages to be more efficient on the client, network and
  // server-side. While the connection is either a persistent HTTP 2 connection or
  // an HTTP 1.1 connection with keep-alive, there is still some overhead involved
  // in having many small messages.
  //
  // For this reason we attempt batching. When batching we must be careful to
  // force a transmission when the document is unloaded.
  onLastChance(flush);

  return {
    send(item: T): void {
      if (isWindowHidden()) {
        // We cannot guarantee that we will ever get time to transmit data in a batched
        // format when the window is hidden, as this might occur while the document is
        // being unloaded. Immediately force a transmission in these cases.
        sendInternal([item]);
        return;
      }

      queuedItems.push(item);
      if (queuedItems.length >= MAX_QUEUE_SIZE) {
        flush();
      } else if (pendingFlushTimeout == null) {
        pendingFlushTimeout = setTimeout(flush, SCHEDULE_DELAY_MILLIS);
      }
    },
  };

  function flush() {
    if (pendingFlushTimeout != null) {
      clearTimeout(pendingFlushTimeout);
      pendingFlushTimeout = null;
    }

    if (queuedItems.length > 0) {
      sendInternal(queuedItems.slice());
      queuedItems.length = 0;
    }
  }
}

function isWindowHidden() {
  return doc?.visibilityState !== "visible";
}
