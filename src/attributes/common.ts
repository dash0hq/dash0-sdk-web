import { KeyValue } from "../../types/otlp";
import { generateUniqueId, nav, NO_VALUE_FALLBACK, WEB_EVENT_ID_BYTES, win } from "../utils";
import {
  BROWSER_TAB_ID,
  NETWORK_CONNECTION_TYPE,
  PAGE_URL_ATTR_PREFIX,
  SESSION_ID,
  WEB_EVENT_ID,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
} from "../semantic-conventions";
import { sessionId } from "../api/session";
import { vars } from "../vars";
import { addAttribute } from "../utils/otel";
import { addUrlAttributes } from "./url";
import { tabId } from "../utils/tab-id";

type Options = {
  /**
   * Override url to be used instead of window.location.href
   */
  url?: string | URL;
};

export function addCommonAttributes(attributes: KeyValue[], options?: Options): void {
  if (attributes.find((attribute) => attribute.key === WEB_EVENT_ID) === undefined) {
    addAttribute(attributes, WEB_EVENT_ID, generateUniqueId(WEB_EVENT_ID_BYTES));
  }

  for (let i = 0; i < vars.signalAttributes.length; i++) {
    attributes.push(vars.signalAttributes[i]!);
  }

  addUrlAttributes(attributes, options?.url ?? win?.location.href ?? NO_VALUE_FALLBACK, PAGE_URL_ATTR_PREFIX);

  if (sessionId) {
    addAttribute(attributes, SESSION_ID, sessionId);
  }
  if (tabId) {
    addAttribute(attributes, BROWSER_TAB_ID, tabId);
  }

  addAttribute(attributes, WINDOW_WIDTH, win?.innerWidth ?? NO_VALUE_FALLBACK);
  addAttribute(attributes, WINDOW_HEIGHT, win?.innerHeight ?? NO_VALUE_FALLBACK);

  // @ts-expect-error -- TypeScript is not aware of navigator.connection.effectiveType
  const connectionType = nav?.connection?.effectiveType;
  if (connectionType) {
    addAttribute(attributes, NETWORK_CONNECTION_TYPE, connectionType);
  }
}
