import { parseTraceparent, TraceContext } from "../utils/otel/trace-context";
import { debug } from "../utils";

let parentTraceContext: Required<TraceContext> | undefined;

export function setParentTraceContext(traceparent: string | undefined) {
  parentTraceContext = traceparent ? parseTraceparent(traceparent) : undefined;
  if (traceparent && !parentTraceContext) {
    debug("Ignoring invalid traceparent, HTTP spans start their own traces", traceparent);
  }
}

export function getParentTraceContext(): Required<TraceContext> | undefined {
  return parentTraceContext;
}
