// aliasing the global function for improved minification and
// protection against hasOwnProperty overrides.
import { KeyValue } from "../../types/otlp";

export function addAttribute(attributes: KeyValue[], key: string, value: string) {
  attributes.push({
    "key": key,
    "value": {
      "stringValue": value
    }
  })
}

export function removeAttribute(attributes: KeyValue[], key: string) {
  const index = attributes.findIndex(attr => attr['key'] === key);
  if (index !== -1) {
    attributes.splice(index, 1);
  }
}
