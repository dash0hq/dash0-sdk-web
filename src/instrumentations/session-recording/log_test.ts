import { describe, expect, it, vi } from "vitest";
import { buildSessionRecordingLog } from "./log";
import { Chunk } from "./chunker";

vi.mock("../../api/session", () => ({ sessionId: "aabbccdd11223344" }));

describe("session recording log record", () => {
  const stream = {
    recordingId: "0123456789abcdef0123456789abcdef",
    traceId: "d04200aabbccdd112233440123456789",
    spanId: "0123456789abcdef",
  };

  const chunk: Chunk = {
    seq: 3,
    body: '[{"type":2,"timestamp":1700000000000}]',
    eventCount: 1,
    hasSnapshot: true,
    startTime: 1700000000000,
    endTime: 1700000004500,
  };

  it("builds an INFO log record with the chunk body as a string", () => {
    const log = buildSessionRecordingLog(stream, chunk);

    expect(log.timeUnixNano).toBe("1700000000000000000");
    expect(log.severityNumber).toBe(9);
    expect(log.severityText).toBe("INFO");
    expect(log.body).toEqual({ stringValue: chunk.body });
    expect(log.traceId).toBe(stream.traceId);
    expect(log.spanId).toBe(stream.spanId);
  });

  it("stamps the event name, the stream and the chunk metadata as attributes", () => {
    const log = buildSessionRecordingLog(stream, chunk);

    expect(log.attributes).toEqual(
      expect.arrayContaining([
        { key: "event.name", value: { stringValue: "browser.session_recording" } },
        { key: "session.id", value: { stringValue: "aabbccdd11223344" } },
        { key: "dash0.session_recording.id", value: { stringValue: stream.recordingId } },
        { key: "dash0.session_recording.seq", value: { intValue: "3" } },
        { key: "dash0.session_recording.event_count", value: { intValue: "1" } },
        { key: "dash0.session_recording.has_snapshot", value: { boolValue: true } },
        { key: "dash0.session_recording.end_time_unix_nano", value: { intValue: "1700000004500000000" } },
      ])
    );
  });

  it("keeps the trace and span ids stable across chunks of one stream", () => {
    const first = buildSessionRecordingLog(stream, chunk);
    const second = buildSessionRecordingLog(stream, { ...chunk, seq: 4, hasSnapshot: false });

    expect(second.traceId).toBe(first.traceId);
    expect(second.spanId).toBe(first.spanId);
    expect(second.attributes).toEqual(
      expect.arrayContaining([{ key: "dash0.session_recording.has_snapshot", value: { boolValue: false } }])
    );
  });
});
