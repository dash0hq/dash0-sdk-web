import { parseTraceparent, TraceContext } from "../utils/otel/trace-context";
import { debug } from "../utils";

let parentTraceContext: Required<TraceContext> | undefined;

export function setParentTraceContext(traceparent: string | undefined) {
  if (traceparent === undefined) {
    parentTraceContext = undefined;
    return;
  }
  const parsed = parseTraceparent(traceparent);
  if (!parsed) {
    debug("Ignoring invalid traceparent", traceparent);
    return;
  }
  parentTraceContext = parsed;
}

export function getParentTraceContext(): Required<TraceContext> | undefined {
  return parentTraceContext;
}
