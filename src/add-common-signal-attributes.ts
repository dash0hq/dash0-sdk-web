import { KeyValue } from "../types/otlp";
import { addAttribute, nav, win } from "./utils";
import { NETWORK_CONNECTION_TYPE, SESSION_ID, URL_FULL, WINDOW_HEIGHT, WINDOW_WIDTH } from "./semantic-conventions";
import { sessionId } from "./api/session";
import { vars } from "./vars";

export function addCommonSignalAttributes(attributes: KeyValue[]): void {
  for (let i = 0; i < vars.signalAttributes.length; i++) {
    attributes.push(vars.signalAttributes[i]!);
  }

  addAttribute(attributes, URL_FULL, win.location.href);

  if (sessionId) {
    addAttribute(attributes, SESSION_ID, sessionId);
  }

  addAttribute(attributes, WINDOW_WIDTH, win.innerWidth);
  addAttribute(attributes, WINDOW_HEIGHT, win.innerHeight);

  // TypeScript is not aware of navigator.connection.effectiveType
  const anyNav = nav as any;
  if (anyNav["connection"] && anyNav["connection"]["effectiveType"]) {
    addAttribute(attributes, NETWORK_CONNECTION_TYPE, anyNav["connection"]["effectiveType"]);
  }
}
