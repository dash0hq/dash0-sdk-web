import { AnyValue } from "../../types/otlp";
import { addAttribute, AttributeValueType, removeAttribute } from "../utils/otel";
import { vars } from "../vars";

/**
 * Adds a signal attribute to be transmitted with every signal.
 * Note: if you need to ensure attributes are included with signals transmitted on initial page load, you should use
 * the "additionalSignalAttributes" property of the init call instead
 */
export function addSignalAttribute(name: string, value: AttributeValueType | AnyValue) {
  addAttribute(vars.signalAttributes, name, value);
}

/**
 * Removes a previously added signal attribute
 */
export function removeSignalAttribute(name: string) {
  removeAttribute(vars.signalAttributes, name);
}
