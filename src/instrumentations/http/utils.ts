import { addAttribute, addSpanEvent, InProgressSpan } from "../../utils/otel";
import { domHRTimestampToNanos, hasKey, PerformanceTimingNames } from "../../utils";
import { HTTP_RESPONSE_BODY_SIZE } from "../../semantic-conventions";

// SEE: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/attributes-registry/http.md?plain=1#L67
const KNOWN_HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"];
export const HTTP_METHOD_OTHER = "_OTHER";

export function isWellKnownHttpMethod(method: string): boolean {
  return KNOWN_HTTP_METHODS.includes(method);
}

export function addResourceNetworkEvents(span: InProgressSpan, resource: PerformanceResourceTiming) {
  const ignoreZeros = resource.startTime !== 0;

  addSpanNetworkEvent(span, PerformanceTimingNames.FETCH_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.DOMAIN_LOOKUP_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.DOMAIN_LOOKUP_END, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.CONNECT_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.SECURE_CONNECTION_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.CONNECT_END, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.REQUEST_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.RESPONSE_START, resource, ignoreZeros);
  addSpanNetworkEvent(span, PerformanceTimingNames.RESPONSE_END, resource, ignoreZeros);
}

function addSpanNetworkEvent(
  span: InProgressSpan,
  propertyName: string,
  resource: PerformanceResourceTiming,
  ignoreZeros: boolean = true
) {
  if (
    !hasKey(resource, propertyName) ||
    typeof resource[propertyName] !== "number" ||
    (ignoreZeros && resource[propertyName] === 0)
  ) {
    return;
  }

  addSpanEvent(span, propertyName, domHRTimestampToNanos(resource[propertyName]));
}

export function addResourceSize(span: InProgressSpan, resource: PerformanceResourceTiming) {
  const encodedLength = resource.encodedBodySize;
  if (encodedLength != undefined) {
    addAttribute(span.attributes, HTTP_RESPONSE_BODY_SIZE, encodedLength);
  }
}
