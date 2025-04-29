import { KeyValue, Span, SpanStatus } from "../../../types/otlp";
import { nowNanos } from "../time";
import { generateUniqueId, SPAN_ID_BYTES, TRACE_ID_BYTES } from "../id";
import { SPAN_STATUS_UNSET } from "../../semantic-conventions";

export type InProgressSpan = Omit<Span, "endTimeUnixNano">;

export function startSpan(name: string): InProgressSpan {
  return {
    traceId: generateUniqueId(TRACE_ID_BYTES),
    spanId: generateUniqueId(SPAN_ID_BYTES),
    name,
    // Always CLIENT for now https://github.com/open-telemetry/opentelemetry-proto/blob/ac3242b03157295e4ee9e616af53b81517b06559/opentelemetry/proto/trace/v1/trace.proto#L143-L169
    // Note: we directly define otlp here, this differs from the values used by oteljs internally.
    kind: 3,
    startTimeUnixNano: nowNanos(),
    attributes: [],
    events: [],
    links: [],
    status: { code: SPAN_STATUS_UNSET },
  };
}

export function endSpan(span: InProgressSpan, status: SpanStatus | undefined, durationNano: number | undefined): Span {
  // We cast here to avoid having to instantiate a copy of the span
  const s = span as Span;
  if (status) {
    s.status = status;
  }
  s.endTimeUnixNano =
    durationNano != null ? String(Math.round(parseInt(s.startTimeUnixNano) + durationNano)) : nowNanos();
  return s;
}

/**
 * Adds an event to a span. Can optionally accept the events timestamp and attributes for the event.
 * The timestamp needs to be specified as nanoseconds since unix epoch in string format.
 */
export function addSpanEvent(
  span: InProgressSpan,
  name: string,
  attributesOrTs?: string | KeyValue[] | undefined,
  attributes?: KeyValue[] | undefined
) {
  let ts: string | undefined = undefined;
  let attr: KeyValue[] | undefined = undefined;

  if (typeof attributesOrTs === "string") {
    ts = attributesOrTs;
  } else if (Array.isArray(attributesOrTs)) {
    attr = attributesOrTs;
  }

  if (attributes) {
    attr = attributes;
  }

  span.events.push({
    name,
    timeUnixNano: ts != null ? ts : nowNanos(),
    attributes: attr ?? [],
  });
}

export function setSpanStatus(span: InProgressSpan, code: SpanStatus["code"], message?: string) {
  span.status = {
    code,
    message,
  };
}
