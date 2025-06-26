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
   * W3C Traceparent header.
   * General format is ${version}-${trace-id}-${parent-id}-${trace-flags}
   *
   * The only spec'd version is currently 00
   * Trace flags are an 8 bit field of bit flags:
   * Sampled: 00000001 - Should only be set if a definite decision to record the trace was made.
   * If set downstream processors should also record the trace
   * Random Trace ID: 00000010 - IF set the component guarantees that the seven right most bytes of the trace-id
   * are randomly generated. Downstream processors are then able to rely on this for technical things like shard keys.
   *
   * References:
   * https://www.w3.org/TR/trace-context-2/#traceparent-header
   * https://www.w3.org/TR/trace-context-2/#trace-flags
   * https://www.w3.org/TR/trace-context-2/#random-trace-id-flag
   */
  fn.call(ctx, "traceparent", `00-${span.traceId}-${span.spanId}-02`);
}
