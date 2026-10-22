import { afterEach, describe, expect, it } from "vitest";
import { getParentTraceContext, setParentTraceContext } from "./parent-trace-context";
import { startSpan } from "../utils/otel/span";
import { crc32 } from "../utils/crc32";

const STEP_TRACE_ID = "643073796e74a1b2c3d4e5f6deadbeef";
const STEP_SPAN_ID = "1122334455667788";
const STEP_TRACEPARENT = `00-${STEP_TRACE_ID}-${STEP_SPAN_ID}-01`;

describe("setParentTraceContext", () => {
  afterEach(() => {
    setParentTraceContext(undefined);
  });

  it("starts HTTP spans with their own trace when no parent is set", () => {
    const span = startSpan("HTTP GET");

    expect(span.traceId.startsWith("d042")).toBe(true);
    expect(span.parentSpanId).toBeUndefined();
  });

  it("starts HTTP spans in the parent's trace, as children of the parent span", () => {
    setParentTraceContext(STEP_TRACEPARENT);

    const span = startSpan("HTTP GET");

    expect(span.traceId).toBe(STEP_TRACE_ID);
    expect(span.parentSpanId).toBe(STEP_SPAN_ID);
    expect(span.spanId).not.toBe(STEP_SPAN_ID);
  });

  it("keeps the span id derived from the adopted trace id", () => {
    setParentTraceContext(STEP_TRACEPARENT);

    const span = startSpan("HTTP GET");

    expect(span.spanId.substring(0, 8)).toBe(crc32(STEP_TRACE_ID).toString(16).padStart(8, "0"));
  });

  it("restores own traces once the parent is cleared", () => {
    setParentTraceContext(STEP_TRACEPARENT);
    setParentTraceContext(undefined);

    const span = startSpan("HTTP GET");

    expect(span.traceId).not.toBe(STEP_TRACE_ID);
    expect(span.parentSpanId).toBeUndefined();
    expect(getParentTraceContext()).toBeUndefined();
  });

  it.each([
    ["a malformed value", "not-a-traceparent"],
    ["an unsupported version", `01-${STEP_TRACE_ID}-${STEP_SPAN_ID}-01`],
    ["an all-zero trace id", `00-${"0".repeat(32)}-${STEP_SPAN_ID}-01`],
    ["an all-zero span id", `00-${STEP_TRACE_ID}-${"0".repeat(16)}-01`],
    ["upper-case hex", `00-${STEP_TRACE_ID.toUpperCase()}-${STEP_SPAN_ID}-01`],
  ])("ignores %s and clears a previous parent", (_, traceparent) => {
    setParentTraceContext(STEP_TRACEPARENT);
    setParentTraceContext(traceparent);

    expect(getParentTraceContext()).toBeUndefined();
    expect(startSpan("HTTP GET").traceId).not.toBe(STEP_TRACE_ID);
  });

  it("accepts surrounding whitespace", () => {
    setParentTraceContext(` ${STEP_TRACEPARENT} `);

    expect(getParentTraceContext()).toEqual({ traceId: STEP_TRACE_ID, spanId: STEP_SPAN_ID });
  });
});
