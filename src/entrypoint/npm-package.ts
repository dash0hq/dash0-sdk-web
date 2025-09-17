import { debug, INIT_MESSAGE } from "../utils";
import { init as initApi } from "../api/init";
import { InitOptions } from "../types/options";

export * from "../api/identify";
export * from "../api/debug";
export * from "../api/attributes";
export * from "../api/events";
export * from "../api/log-level";
export { terminateSession } from "../api/session";
export { reportError } from "../api/report-error";

// Additional utility types
export type { AttributeValueType } from "../utils/otel";
export type { AnyValue } from "../types/otlp";
export type { PageViewMeta, PropagatorConfig, PropagatorType } from "../vars";
export type { UrlAttributeScrubber, UrlAttributeRecord } from "../attributes/url";

export function init(opts: InitOptions): void {
  debug(`${INIT_MESSAGE} (via package)`);
  initApi(opts);
}
