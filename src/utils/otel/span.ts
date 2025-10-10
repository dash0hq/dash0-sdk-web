import { nowNanos } from "../time";
import { SPAN_KIND_CLIENT, SPAN_STATUS_UNSET, WEB_EVENT_ID } from "../../semantic-conventions";
import { sessionId } from "../../api/session";
import { generateTraceId } from "../trace-id";
import { generateSpanId } from "../span-id";
import { addAttribute } from "./attributes";
import { KeyValue, Span, SpanStatus } from "../../types/otlp";
import { debug } from "../debug";

export type InProgressSpan = Omit<Span, "endTimeUnixNano">;

export function startSpan(name: string): InProgressSpan {
  const traceId = generateTraceId(sessionId);
  const spanId = generateSpanId(traceId);

  const attributes: KeyValue[] = [];
  addAttribute(attributes, WEB_EVENT_ID, spanId);

  return {
    traceId,
    spanId,
    name,
    // Always CLIENT for now https://github.com/open-telemetry/opentelemetry-proto/blob/ac3242b03157295e4ee9e616af53b81517b06559/opentelemetry/proto/trace/v1/trace.proto#L143-L169
    // Note: we directly define otlp here, this differs from the values used by oteljs internally.
    kind: SPAN_KIND_CLIENT,
    startTimeUnixNano: nowNanos(),
    attributes,
    events: [],
    links: [],
    status: { code: SPAN_STATUS_UNSET },
  };
}

/**
 * Ends the span by setting status and endTimeUnixNano on it. If the spand was already previously ended, this returns undefined
 * to prevent the span from being ended multiple times on accident.
 */
export function endSpan(
  span: InProgressSpan,
  status: SpanStatus | undefined,
  durationNano: number | undefined
): Span | undefined {
  // We cast here to avoid having to instantiate a copy of the span
  const s = span as Span;

  if (s.endTimeUnixNano) {
    debug("Attempting to end already ended span. Dropping...", s);
    return undefined;
  }

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
