import { KeyValue, LogRecord } from "../../../types/otlp";
import { addAttribute, getTraceContextForPageLoad } from "../../utils/otel";
import {
  EVENT_NAME,
  LOG_SEVERITIES,
  PAGE_VIEW,
  PAGE_VIEW_CHANGE_STATE,
  PAGE_VIEW_CHANGE_STATE_VALUES,
  PAGE_VIEW_TYPE,
  PAGE_VIEW_TYPE_VALUES,
} from "../../semantic-conventions";
import { doc, NO_VALUE_FALLBACK, nowNanos } from "../../utils";
import { addCommonAttributes } from "../../attributes";
import { sendLog } from "../../transport";
import { PageViewMeta, vars } from "../../vars";

function getPageViewMeta(url?: URL): PageViewMeta {
  if (!url) return {};

  return vars.pageViewInstrumentation.generateMetadata?.(url) ?? {};
}

export function transmitPageViewEvent(url?: URL, virtual?: boolean, replaced?: boolean) {
  const meta = getPageViewMeta();

  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, PAGE_VIEW);

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "type", 0);
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
    timeUnixNano: nowNanos(),
    attributes: attributes,
    severityNumber: LOG_SEVERITIES.INFO,
    severityText: "INFO",
    body: {
      kvlistValue: {
        values: bodyAttributes,
      },
    },
  };
  addCommonAttributes(log.attributes);

  const traceContext = getTraceContextForPageLoad();
  if (traceContext) {
    log.traceId = traceContext.traceId;
    log.spanId = traceContext.spanId;
  }

  sendLog(log);
}
