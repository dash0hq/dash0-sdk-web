import { doc } from "./globals";
import { perf } from "./performance";

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
