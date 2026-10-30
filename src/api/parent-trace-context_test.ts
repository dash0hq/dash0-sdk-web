import { afterEach, describe, expect, it } from "vitest";
import { getParentTraceContext, setParentTraceContext } from "./parent-trace-context";
import { endSpan, startSpan } from "../utils/otel/span";
import { crc32 } from "../utils/crc32";

const STEP_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
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
    ["an empty value", ""],
    ["a one-digit flags field", `00-${STEP_TRACE_ID}-${STEP_SPAN_ID}-1`],
    ["non-hex flags", `00-${STEP_TRACE_ID}-${STEP_SPAN_ID}-gg`],
    ["extra fields", `${STEP_TRACEPARENT}-extra`],
  ])("ignores %s without changing the parent", (_, traceparent) => {
    setParentTraceContext(traceparent);
    expect(startSpan("HTTP GET").parentSpanId).toBeUndefined();

    setParentTraceContext(STEP_TRACEPARENT);
    setParentTraceContext(traceparent);

    expect(startSpan("HTTP GET")).toMatchObject({ traceId: STEP_TRACE_ID, parentSpanId: STEP_SPAN_ID });
  });

  it.each(["00", "01", "0a", "ff"])("accepts the two-digit hex flags %s", (flags) => {
    setParentTraceContext(`00-${STEP_TRACE_ID}-${STEP_SPAN_ID}-${flags}`);

    expect(startSpan("HTTP GET")).toMatchObject({ traceId: STEP_TRACE_ID, parentSpanId: STEP_SPAN_ID });
  });

  it("snapshots the parent at span start across replacement and clearing", () => {
    setParentTraceContext(STEP_TRACEPARENT);
    const first = startSpan("HTTP GET");
    const nextTraceId = "0af7651916cd43dd8448eb211c80319c";
    const nextSpanId = "b7ad6b7169203331";
    setParentTraceContext(`00-${nextTraceId}-${nextSpanId}-01`);
    const second = startSpan("HTTP POST");
    setParentTraceContext(undefined);

    expect(endSpan(first, undefined, 100)).toMatchObject({ traceId: STEP_TRACE_ID, parentSpanId: STEP_SPAN_ID });
    expect(endSpan(second, undefined, 200)).toMatchObject({ traceId: nextTraceId, parentSpanId: nextSpanId });
    expect(startSpan("HTTP GET").parentSpanId).toBeUndefined();
  });

  it("accepts surrounding whitespace", () => {
    setParentTraceContext(` ${STEP_TRACEPARENT} `);

    expect(getParentTraceContext()).toEqual({ traceId: STEP_TRACE_ID, spanId: STEP_SPAN_ID });
  });
});
