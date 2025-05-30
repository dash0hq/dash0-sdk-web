import { AnyValue, KeyValue } from "../../../types/otlp";

type PrimitiveAttributeValue = string | number | boolean;
export type AttributeValueType =
  | PrimitiveAttributeValue
  | Array<PrimitiveAttributeValue>
  | Record<string, PrimitiveAttributeValue>;

const ANY_VALUE_KEYS = [
  "stringValue",
  "boolValue",
  "intValue",
  "doubleValue",
  "arrayValue",
  "kvlistValue",
  "bytesValue",
];

function isAnyValue(value: unknown): value is AnyValue {
  if (value == null || typeof value !== "object") return false;

  const keys = Object.keys(value);
  return keys.length === 1 && ANY_VALUE_KEYS.includes(keys[0]!);
}

export function toAnyValue(value: AttributeValueType | AnyValue): AnyValue;
export function toAnyValue(value?: AttributeValueType | AnyValue): AnyValue | undefined;
export function toAnyValue(value?: AttributeValueType | AnyValue): AnyValue | undefined {
  if (value == null) {
    return undefined;
  }

  let anyValue: AnyValue = {};
  if (Array.isArray(value)) {
    anyValue["arrayValue"] = { values: value.map((e) => toAnyValue(e)) };
  } else if (typeof value === "string") {
    anyValue["stringValue"] = value;
  } else if (typeof value === "number") {
    anyValue["doubleValue"] = value;
  } else if (typeof value === "boolean") {
    anyValue["boolValue"] = value;
  } else if (isAnyValue(value)) {
    anyValue = value;
  } else if (typeof value === "object") {
    anyValue["kvlistValue"] = { values: Object.entries(value).map(([key, value]) => toKeyValue(key, value)) };
  }

  return anyValue;
}

export function toKeyValue(key: string, value: AttributeValueType | AnyValue): KeyValue {
  return {
    key: key,
    value: toAnyValue(value),
  };
}

export function addAttribute(attributes: KeyValue[], key: string, value: AttributeValueType | AnyValue) {
  attributes.push(toKeyValue(key, value));
}

export function removeAttribute(attributes: KeyValue[], key: string) {
  const index = attributes.findIndex((attr) => attr["key"] === key);
  if (index !== -1) {
    attributes.splice(index, 1);
  }
}
