import { LOG_SEVERITY_NUMBER, LOG_SEVERITY_TEXT } from "../semantic-conventions";

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

export type SpanLink = {
  /** Format: byte */
  traceId: string;
  /** Format: byte */
  spanId: string;
  traceState?: string;
  attributes: KeyValue[];
  droppedAttributesCount: number;
  flags?: number;
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

// OTLP profiles v1development, as of opentelemetry-proto v1.11.0. Only the fields the SDK sets.
// https://github.com/open-telemetry/opentelemetry-proto/blob/v1.11.0/opentelemetry/proto/profiles/v1development/profiles.proto
export type ExportProfilesServiceRequest = {
  resourceProfiles: ResourceProfiles[];
  dictionary: ProfilesDictionary;
};

export type ResourceProfiles = {
  resource: Resource;
  scopeProfiles: ScopeProfiles[];
};

export type ScopeProfiles = {
  scope: InstrumentationScope;
  profiles: Profile[];
};

/** Index 0 of every table holds the zero value; an index of 0 means "unset". */
export type ProfilesDictionary = {
  mappingTable: Mapping[];
  locationTable: Location[];
  functionTable: ProfileFunction[];
  linkTable: object[];
  stringTable: string[];
  attributeTable: ProfileAttribute[];
  stackTable: Stack[];
};

export type ValueType = {
  typeStrindex: number;
  unitStrindex: number;
};

export type Profile = {
  sampleType: ValueType;
  samples: Sample[];
  timeUnixNano: string;
  durationNano: string;
  periodType: ValueType;
  period: string;
  profileId: string;
  attributeIndices: number[];
};

export type Sample = {
  stackIndex: number;
  timestampsUnixNano: string[];
};

export type Mapping = {
  filenameStrindex?: number;
  attributeIndices?: number[];
};

export type Location = {
  mappingIndex?: number;
  lines?: Line[];
  attributeIndices?: number[];
};

export type Line = {
  functionIndex: number;
  line: string;
  column: string;
};

export type ProfileFunction = {
  nameStrindex?: number;
  filenameStrindex?: number;
};

export type ProfileAttribute = {
  keyStrindex?: number;
  value?: AnyValue;
};

export type Stack = {
  locationIndices?: number[];
};
