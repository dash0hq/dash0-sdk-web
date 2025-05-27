import { AnyValue, KeyValue } from "../../../types/otlp";

export type AttributeValueType = string | number | boolean | Array<string | number | boolean>;

function toAnyValue(value: AttributeValueType | AnyValue): AnyValue {
  let anyValue: AnyValue = {};
  if (Array.isArray(value)) {
    anyValue["arrayValue"] = { values: value.map((e) => toAnyValue(e)) };
  } else if (typeof value === "string") {
    anyValue["stringValue"] = value;
  } else if (typeof value === "number") {
    anyValue["doubleValue"] = value;
  } else if (typeof value === "boolean") {
    anyValue["boolValue"] = value;
  } else {
    anyValue = value;
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
