import { setTimeout, clearTimeout } from "../../utils/timers";
import { SessionRecordingEvent } from "../../types/session-recording";

const RRWEB_EVENT_TYPE_FULL_SNAPSHOT = 2;
const RRWEB_EVENT_TYPE_META = 4;

export type Chunk = {
  /**
   * Zero-based, monotonic within one recording.
   */
  seq: number;
  /**
   * The rrweb events as a serialized JSON array.
   */
  body: string;
  eventCount: number;
  hasSnapshot: boolean;
  /**
   * Milliseconds since the unix epoch of the first and the last event in the chunk.
   */
  startTime: number;
  endTime: number;
};

export type ChunkerOptions = {
  maxBytes: number;
  maxMillis: number;
  onChunk: (chunk: Chunk) => void;
};

export type Chunker = {
  add(event: SessionRecordingEvent): void;
  flush(): void;
  /**
   * Drops buffered events without emitting a chunk and cancels the pending time-based flush. Used when the
   * recorder failed to start after it already emitted events, so no stray chunk is transmitted later.
   */
  discard(): void;
};

/**
 * Buffers rrweb events and hands them out as chunks. A chunk closes when its serialized size reaches
 * `maxBytes`, when `maxMillis` have passed since its first event, when a new full snapshot begins, or when
 * `flush()` is called. Events are serialized once, on arrival, so a flush is a join and not a second stringify.
 */
export function newChunker(opts: ChunkerOptions): Chunker {
  let serialized: string[] = [];
  let byteSize = 0;
  let hasSnapshot = false;
  let startTime = 0;
  let endTime = 0;
  let seq = 0;
  let pendingFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  return { add, flush, discard };

  function add(event: SessionRecordingEvent): void {
    // A Meta event announces a new full snapshot. Close the current chunk first so the snapshot starts a fresh
    // one and a replay can begin at that chunk.
    if (event.type === RRWEB_EVENT_TYPE_META && serialized.length > 0) {
      flush();
    }

    const json = JSON.stringify(event);
    if (json == null) return;

    if (serialized.length === 0) {
      startTime = event.timestamp;
      pendingFlushTimeout = setTimeout(flush, opts.maxMillis);
    }

    serialized.push(json);
    byteSize += json.length;
    endTime = event.timestamp;
    if (event.type === RRWEB_EVENT_TYPE_FULL_SNAPSHOT) {
      hasSnapshot = true;
    }

    if (byteSize >= opts.maxBytes) {
      flush();
    }
  }

  function discard(): void {
    clearPendingFlush();
    serialized = [];
    byteSize = 0;
    hasSnapshot = false;
  }

  function clearPendingFlush(): void {
    if (pendingFlushTimeout != null) {
      clearTimeout(pendingFlushTimeout);
      pendingFlushTimeout = null;
    }
  }

  function flush(): void {
    clearPendingFlush();

    if (serialized.length === 0) return;

    const chunk: Chunk = {
      seq: seq++,
      body: "[" + serialized.join(",") + "]",
      eventCount: serialized.length,
      hasSnapshot,
      startTime,
      endTime,
    };

    serialized = [];
    byteSize = 0;
    hasSnapshot = false;

    opts.onChunk(chunk);
  }
}
