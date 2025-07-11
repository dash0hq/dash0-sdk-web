import { KeyValue, LogRecord } from "../../../types/otlp";
import { addAttribute, getTraceContextForPageLoad } from "../../utils/otel";
import {
  EVENT_NAME,
  EVENT_NAMES,
  LOG_SEVERITIES,
  PAGE_VIEW_CHANGE_STATE,
  PAGE_VIEW_CHANGE_STATE_VALUES,
  PAGE_VIEW_TYPE,
  PAGE_VIEW_TYPE_VALUES,
} from "../../semantic-conventions";
import { doc, NO_VALUE_FALLBACK } from "../../utils";
import { addCommonAttributes } from "../../attributes";
import { sendLog } from "../../transport";
import { PageViewMeta, vars } from "../../vars";

function getPageViewMeta(url?: URL): PageViewMeta {
  if (!url) return {};

  return vars.pageViewInstrumentation.generateMetadata?.(url) ?? {};
}

export function transmitPageViewEvent(timeUnixNano: string, url?: URL, virtual?: boolean, replaced?: boolean) {
  const meta = getPageViewMeta(url);

  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.PAGE_VIEW);

  if (meta.attributes) {
    Object.entries(meta.attributes).forEach(([key, value]) => addAttribute(attributes, key, value));
  }
  addCommonAttributes(attributes, { url });

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "title", meta.title ?? doc?.title ?? NO_VALUE_FALLBACK);
  if (doc?.referrer) {
    addAttribute(bodyAttributes, "referrer", doc.referrer);
  }

  addAttribute(bodyAttributes, PAGE_VIEW_TYPE, virtual ? PAGE_VIEW_TYPE_VALUES.VIRTUAL : PAGE_VIEW_TYPE_VALUES.INITIAL);
  addAttribute(
    bodyAttributes,
    PAGE_VIEW_CHANGE_STATE,
    replaced ? PAGE_VIEW_CHANGE_STATE_VALUES.REPLACE : PAGE_VIEW_CHANGE_STATE_VALUES.PUSH
  );

  const log: LogRecord = {
    timeUnixNano: timeUnixNano,
    attributes: attributes,
    severityNumber: LOG_SEVERITIES.INFO,
    severityText: "INFO",
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };

  const traceContext = getTraceContextForPageLoad();
  if (traceContext) {
    log.traceId = traceContext.traceId;
    log.spanId = traceContext.spanId;
  }

  sendLog(log);
}
