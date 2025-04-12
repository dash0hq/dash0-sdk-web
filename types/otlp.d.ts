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
}

export type InstrumentationScope = {
  ["name"]?: string;
  ["version"]?: string;
  ["attributes"]: KeyValue[];
}

export type ExportLogRecordRequest = {
  "resourceLogs": ResourceLogs[];
}

export type ResourceLogs = {
  "resource": Resource;
  "scopeLogs": ScopeLogs[];
};

export type ScopeLogs = {
  "scope"?: InstrumentationScope;
  "logRecords": LogRecord[];
  "schemaUrl"?: string;
};

export type LogRecord = {
  /** Format: uint64 */
  timeUnixNano: string;
  severityNumber?: number;
  severityText?: string;
  body?: AnyValue;
  attributes: KeyValue[];
  /** Format: byte */
  traceId?: string;
  /** Format: byte */
  spanId?: string;
};
