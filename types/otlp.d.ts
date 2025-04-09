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
