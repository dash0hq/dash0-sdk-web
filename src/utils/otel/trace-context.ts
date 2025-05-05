import { doc } from "../globals";
import { perf } from "../globals";
import { InProgressSpan } from "./span";

const TRACE_PARENT_HEADER = "traceparent";

type TraceContext = {
  traceId?: string;
  spanId?: string;
};

/**
 * See https://www.w3.org/TR/trace-context/#traceparent-header
 */
const w3cTraceparentFormat = /^00-([a-f0-9]{32})-([a-f0-9]{16})-[0-9]{1,2}$/;

export function getTraceContextForPageLoad(): TraceContext | undefined {
  const match =
    getTraceparentFromMetaElement().match(w3cTraceparentFormat) ||
    getTraceparentFromNavigationTiming().match(w3cTraceparentFormat);
  if (match) {
    return {
      traceId: match[1],
      spanId: match[2],
    };
  }

  return undefined;
}

function getTraceparentFromMetaElement(): string {
  return (
    Array.from(doc?.getElementsByTagName("meta") ?? [])
      .find((e) => e.getAttribute("name")?.toLowerCase() === TRACE_PARENT_HEADER)
      ?.content.trim() || ""
  );
}

function getTraceparentFromNavigationTiming(): string {
  const nt = perf.getEntriesByType("navigation")[0];
  if (!nt) {
    return "";
  }

  if (!nt.serverTiming) {
    return "";
  }

  return getTraceparentFromServerTiming(nt.serverTiming);
}

function getTraceparentFromServerTiming(serverTimings: readonly PerformanceServerTiming[]): string {
  for (const serverEntry of serverTimings) {
    if (serverEntry.name === TRACE_PARENT_HEADER) {
      return serverEntry.description.trim();
    }
  }

  return "";
}

export function addTraceContextHttpHeaders(
  fn: (name: string, value: string) => void,
  ctx: unknown,
  span: InProgressSpan
) {
  /**
   * The following code supports W3C trace context headers, ensuring compatibility with OpenTelemetry (OTel).
   * The "03" flag at the end indicates that the trace was randomly generated and is not sampled from the client.
   * If the trace generation method changes in the future, remove the "03" flag from the end.
   *
   * References:
   * https://www.w3.org/TR/trace-context-2/#trace-flags
   * https://www.w3.org/TR/trace-context-2/#random-trace-id-flag
   */
  fn.call(ctx, "traceparent", `00-${span.traceId}-${span.traceId}-03`);
}
