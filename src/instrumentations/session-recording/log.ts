import { addAttribute } from "../../utils/otel";
import {
  EVENT_NAME,
  EVENT_NAMES,
  LOG_SEVERITIES,
  SESSION_RECORDING_END_TIME_UNIX_NANO,
  SESSION_RECORDING_EVENT_COUNT,
  SESSION_RECORDING_HAS_SNAPSHOT,
  SESSION_RECORDING_ID,
  SESSION_RECORDING_SEQ,
} from "../../semantic-conventions";
import { addCommonAttributes } from "../../attributes";
import { toNanosTs } from "../../utils";
import { KeyValue, LogRecord } from "../../types/otlp";
import { Chunk } from "./chunker";

export type RecordingStream = {
  /**
   * Identifies one recorder run. All chunks of the run share it.
   */
  recordingId: string;
  /**
   * Trace context shared by all chunks of the run. The trace ID embeds the session ID.
   */
  traceId: string;
  spanId: string;
};

export function buildSessionRecordingLog(stream: RecordingStream, chunk: Chunk): LogRecord {
  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.SESSION_RECORDING);
  addCommonAttributes(attributes);
  addAttribute(attributes, SESSION_RECORDING_ID, stream.recordingId);
  addAttribute(attributes, SESSION_RECORDING_SEQ, { intValue: String(chunk.seq) });
  addAttribute(attributes, SESSION_RECORDING_EVENT_COUNT, { intValue: String(chunk.eventCount) });
  addAttribute(attributes, SESSION_RECORDING_HAS_SNAPSHOT, chunk.hasSnapshot);
  addAttribute(attributes, SESSION_RECORDING_END_TIME_UNIX_NANO, { intValue: toNanosTs(chunk.endTime) });

  return {
    timeUnixNano: toNanosTs(chunk.startTime),
    severityNumber: LOG_SEVERITIES.INFO,
    severityText: "INFO",
    body: { stringValue: chunk.body },
    attributes,
    traceId: stream.traceId,
    spanId: stream.spanId,
  };
}
