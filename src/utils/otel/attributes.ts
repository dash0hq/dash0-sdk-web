import { AnyValue, KeyValue } from "../../../types/otlp";

export function toKeyValue(key: string, value: string | number | AnyValue): KeyValue {
  let anyValue: AnyValue = {};
  if (typeof value === "string") {
    anyValue["stringValue"] = value;
  } else if (typeof value === "number") {
    anyValue["doubleValue"] = value;
  } else {
    anyValue = value;
  }

  return {
    key: key,
    value: anyValue,
  };
}

export function addAttribute(attributes: KeyValue[], key: string, value: string | number | AnyValue) {
  attributes.push(toKeyValue(key, value));
}

export function removeAttribute(attributes: KeyValue[], key: string) {
  const index = attributes.findIndex((attr) => attr["key"] === key);
  if (index !== -1) {
    attributes.splice(index, 1);
  }
}
