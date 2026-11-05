import { parseTraceparent, TraceContext } from "../utils/otel/trace-context";
import { debug } from "../utils";

let parentTraceContext: Required<TraceContext> | undefined;

export function setParentTraceContext(traceparent: string | null | undefined) {
  if (traceparent === undefined || traceparent === null) {
    parentTraceContext = undefined;
    return;
  }
  const parsed = typeof traceparent === "string" ? parseTraceparent(traceparent) : undefined;
  if (!parsed) {
    debug("Ignoring invalid traceparent", traceparent);
    return;
  }
  parentTraceContext = parsed;
}

export function getParentTraceContext(): Required<TraceContext> | undefined {
  return parentTraceContext;
}
