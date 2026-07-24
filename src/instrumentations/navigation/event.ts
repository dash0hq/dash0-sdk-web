import { addAttribute, AttributeValueType, getTraceContextForPageLoad } from "../../utils/otel";
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
import { AnyValue, KeyValue, LogRecord } from "../../types/otlp";

function getPageViewMeta(url?: URL): PageViewMeta {
  if (!url) return {};

  return vars.pageViewInstrumentation.generateMetadata?.(url) ?? {};
}

type BuildPageViewLogOptions = {
  timeUnixNano: string;
  url?: URL;
  title?: string;
  metaAttributes?: Record<string, AttributeValueType | AnyValue>;
  pageViewType: (typeof PAGE_VIEW_TYPE_VALUES)[keyof typeof PAGE_VIEW_TYPE_VALUES];
  changeState?: (typeof PAGE_VIEW_CHANGE_STATE_VALUES)[keyof typeof PAGE_VIEW_CHANGE_STATE_VALUES];
};

function buildAndSendPageViewLog(opts: BuildPageViewLogOptions) {
  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.PAGE_VIEW);

  if (opts.metaAttributes) {
    Object.entries(opts.metaAttributes).forEach(([key, value]) => addAttribute(attributes, key, value));
  }
  addCommonAttributes(attributes, { url: opts.url });

  const bodyAttributes: KeyValue[] = [];
  addAttribute(bodyAttributes, "title", opts.title ?? doc?.title ?? NO_VALUE_FALLBACK);
  if (doc?.referrer) {
    addAttribute(bodyAttributes, "referrer", doc.referrer);
  }

  addAttribute(bodyAttributes, PAGE_VIEW_TYPE, opts.pageViewType);
  if (opts.changeState) {
    addAttribute(bodyAttributes, PAGE_VIEW_CHANGE_STATE, opts.changeState);
  }

  const log: LogRecord = {
    timeUnixNano: opts.timeUnixNano,
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

export function transmitPageViewEvent(timeUnixNano: string, url?: URL, virtual?: boolean, replaced?: boolean) {
  const meta = getPageViewMeta(url);

  buildAndSendPageViewLog({
    timeUnixNano,
    url,
    title: meta.title,
    metaAttributes: meta.attributes,
    pageViewType: virtual ? PAGE_VIEW_TYPE_VALUES.VIRTUAL : PAGE_VIEW_TYPE_VALUES.INITIAL,
    changeState: replaced ? PAGE_VIEW_CHANGE_STATE_VALUES.REPLACE : PAGE_VIEW_CHANGE_STATE_VALUES.PUSH,
  });
}

export type ManualPageViewOptions = {
  timeUnixNano: string;
  url?: URL;
  title: string;
  attributes?: Record<string, AttributeValueType | AnyValue>;
};

/**
 * Emits a manually-triggered page view log, e.g. from the public `startView` API.
 * Deliberately does NOT read `vars.pageViewInstrumentation.generateMetadata` and does NOT
 * include a `change_state` body key (a manual view is neither a pushState nor replaceState).
 * The emitted `type` is PAGE_VIEW_TYPE_VALUES.VIRTUAL, matching automatic virtual page views —
 * manual views are deliberately indistinguishable from virtual ones downstream.
 */
export function transmitManualPageViewEvent(opts: ManualPageViewOptions) {
  buildAndSendPageViewLog({
    timeUnixNano: opts.timeUnixNano,
    url: opts.url,
    title: opts.title,
    metaAttributes: opts.attributes,
    pageViewType: PAGE_VIEW_TYPE_VALUES.VIRTUAL,
  });
}
