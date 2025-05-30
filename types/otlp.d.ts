import { LOG_SEVERITY_NUMBER, LOG_SEVERITY_TEXT } from "../src/semantic-conventions";

export type AnyValue = {
  ["stringValue"]?: string;
  ["boolValue"]?: boolean;
  /** Format: int64 */
  ["intValue"]?: string;
  /** Format: double */
  ["doubleValue"]?: number;
  ["arrayValue"]?: ArrayValue;
  ["kvlistValue"]?: KeyValueList;
  /** Format: byte */
  ["bytesValue"]?: string;
};

export type ArrayValue = {
  ["values"]: AnyValue[];
};

export type KeyValue = {
  ["key"]: string;
  ["value"]: AnyValue;
};

export type KeyValueList = {
  ["values"]: KeyValue[];
};

export type Resource = {
  ["attributes"]: KeyValue[];
};

export type InstrumentationScope = {
  ["name"]?: string;
  ["version"]?: string;
  ["attributes"]: KeyValue[];
};

export type ExportLogsServiceRequest = {
  resourceLogs: ResourceLogs[];
};

export type ResourceLogs = {
  resource: Resource;
  scopeLogs: ScopeLogs[];
};

export type ScopeLogs = {
  scope?: InstrumentationScope;
  logRecords: LogRecord[];
  schemaUrl?: string;
};

export type LogRecord = {
  /** Format: uint64 */
  timeUnixNano: string;
  severityNumber?: LOG_SEVERITY_NUMBER;
  severityText?: LOG_SEVERITY_TEXT;
  body?: AnyValue;
  attributes: KeyValue[];
  /** Format: byte */
  traceId?: string;
  /** Format: byte */
  spanId?: string;
};

export type ExportTraceServiceRequest = {
  resourceSpans: ResourceSpans[];
};

export type ResourceSpans = {
  resource: Resource;
  scopeSpans: ScopeSpans[];
};

export type ScopeSpans = {
  scope?: InstrumentationScope;
  spans: Span[];
};

export type SpanStatus = {
  message?: string;
  code: 0 | 1 | 2;
};

export type SpanEvent = {
  timeUnixNano: string;
  name: string;
  attributes: KeyValue[];
};

export type Span = {
  /** Format: byte */
  traceId: string;
  /** Format: byte */
  spanId: string;
  traceState?: string;
  /** Format: byte */
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: KeyValue[];
  events: SpanEvent[];
  /** Format: int64 */
  droppedEventsCount?: number;
  links: SpanLink[];
  status: SpanStatus;
};
