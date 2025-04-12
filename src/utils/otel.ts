import { AnyValue, KeyValue } from "../../types/otlp";

export function addAttribute(attributes: KeyValue[], key: string, value: string | number) {
  let anyValue: AnyValue = {};
  if (typeof value === 'string') {
    anyValue['stringValue'] = value;
  } else if (typeof value === 'number') {
    anyValue['doubleValue'] = value;
  }

  attributes.push({
    "key": key,
    "value": anyValue
  })
}

export function removeAttribute(attributes: KeyValue[], key: string) {
  const index = attributes.findIndex(attr => attr['key'] === key);
  if (index !== -1) {
    attributes.splice(index, 1);
  }
}
