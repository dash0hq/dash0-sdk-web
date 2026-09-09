import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chunk, newChunker } from "./chunker";

// The SDK's timer wrapper captures window.setTimeout at import time, before vitest installs fake timers.
// Resolve the globals lazily so vi.useFakeTimers() takes effect.
vi.mock("../../utils/timers", () => ({
  setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) => globalThis.setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof globalThis.clearTimeout>) => globalThis.clearTimeout(...args),
}));

const META = 4;
const FULL_SNAPSHOT = 2;
const INCREMENTAL = 3;

function event(type: number, timestamp: number, data: unknown = {}) {
  return { type, timestamp, data };
}

describe("session recording chunker", () => {
  let chunks: Chunk[];

  beforeEach(() => {
    vi.useFakeTimers();
    chunks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function create(maxBytes = 10_000, maxMillis = 5000) {
    return newChunker({ maxBytes, maxMillis, onChunk: (c) => chunks.push(c) });
  }

  it("does nothing on flush when empty", () => {
    const chunker = create();
    chunker.flush();
    expect(chunks).toEqual([]);
  });

  it("discards buffered events and the pending time-based flush", () => {
    const chunker = create();
    chunker.add(event(META, 1000));
    chunker.add(event(FULL_SNAPSHOT, 1001));

    chunker.discard();
    vi.advanceTimersByTime(10_000);
    expect(chunks).toEqual([]);

    // The chunker stays usable, and the dropped events do not leak into the next chunk.
    chunker.add(event(INCREMENTAL, 2000));
    chunker.flush();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.seq).toBe(0);
    expect(chunks[0]!.eventCount).toBe(1);
    expect(chunks[0]!.hasSnapshot).toBe(false);
  });

  it("flushes on explicit flush with a serialized JSON array body", () => {
    const chunker = create();
    chunker.add(event(META, 1000, { href: "http://x" }));
    chunker.add(event(FULL_SNAPSHOT, 1001));
    chunker.add(event(INCREMENTAL, 1002));
    chunker.flush();

    expect(chunks).toHaveLength(1);
    const chunk = chunks[0]!;
    expect(chunk.seq).toBe(0);
    expect(chunk.eventCount).toBe(3);
    expect(chunk.hasSnapshot).toBe(true);
    expect(chunk.startTime).toBe(1000);
    expect(chunk.endTime).toBe(1002);
    expect(JSON.parse(chunk.body)).toEqual([
      { type: META, timestamp: 1000, data: { href: "http://x" } },
      { type: FULL_SNAPSHOT, timestamp: 1001, data: {} },
      { type: INCREMENTAL, timestamp: 1002, data: {} },
    ]);
  });

  it("flushes when maxMillis elapse after the first event", () => {
    const chunker = create(10_000, 5000);
    chunker.add(event(INCREMENTAL, 1));
    vi.advanceTimersByTime(4999);
    expect(chunks).toHaveLength(0);
    chunker.add(event(INCREMENTAL, 2));
    vi.advanceTimersByTime(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.eventCount).toBe(2);
  });

  it("flushes when the serialized size reaches maxBytes", () => {
    const chunker = create(100, 60_000);
    const payload = "x".repeat(40);
    chunker.add(event(INCREMENTAL, 1, payload)); // ~70 bytes
    expect(chunks).toHaveLength(0);
    chunker.add(event(INCREMENTAL, 2, payload)); // crosses 100
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.eventCount).toBe(2);
  });

  it("emits an oversized single event as its own chunk", () => {
    const chunker = create(50, 60_000);
    chunker.add(event(FULL_SNAPSHOT, 1, "y".repeat(500)));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.eventCount).toBe(1);
    expect(chunks[0]!.hasSnapshot).toBe(true);
  });

  it("closes the current chunk when a Meta event starts a new snapshot", () => {
    const chunker = create();
    chunker.add(event(META, 1));
    chunker.add(event(FULL_SNAPSHOT, 2));
    chunker.add(event(INCREMENTAL, 3));
    expect(chunks).toHaveLength(0);

    chunker.add(event(META, 4));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.eventCount).toBe(3);

    chunker.add(event(FULL_SNAPSHOT, 5));
    chunker.flush();
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.eventCount).toBe(2);
    expect(chunks[1]!.hasSnapshot).toBe(true);
  });

  it("increments seq across chunks and resets hasSnapshot", () => {
    const chunker = create();
    chunker.add(event(FULL_SNAPSHOT, 1));
    chunker.flush();
    chunker.add(event(INCREMENTAL, 2));
    chunker.flush();
    chunker.add(event(INCREMENTAL, 3));
    chunker.flush();

    expect(chunks.map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(chunks.map((c) => c.hasSnapshot)).toEqual([true, false, false]);
  });

  it("cancels the pending timer on flush so it does not fire twice", () => {
    const chunker = create(10_000, 1000);
    chunker.add(event(INCREMENTAL, 1));
    chunker.flush();
    vi.advanceTimersByTime(5000);
    expect(chunks).toHaveLength(1);
  });
});
