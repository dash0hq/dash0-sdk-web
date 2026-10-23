import { sharedAfterEach, sharedBeforeEach, getOTLPRequests } from "../shared";
import { loadPage, retry } from "../utils";
import { expectNoBrowserErrors } from "../expectations";
import { ExportTraceServiceRequest } from "../../../../src/types/otlp";

const PARENT_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_SPAN_ID = "00f067aa0ba902b7";
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

type ExportedSpan = { traceId: string; spanId: string; parentSpanId?: string; method?: string };

async function exportedHttpSpans(): Promise<ExportedSpan[]> {
  const requests = await getOTLPRequests();
  return requests
    .filter((request) => request.path === "/v1/traces")
    .flatMap((request) => (request.body as ExportTraceServiceRequest).resourceSpans)
    .flatMap((resourceSpans) => resourceSpans.scopeSpans)
    .flatMap((scopeSpans) => scopeSpans.spans)
    .filter((span) => span.attributes.some((a) => a.key === "url.path" && a.value.stringValue === "/ajax"))
    .map((span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      method: span.attributes.find((a) => a.key === "http.request.method")?.value.stringValue,
    }));
}

async function receivedTraceparent(method: string): Promise<{ traceId: string; spanId: string }> {
  const response = await fetch("http://127.0.0.1:8012/ajax-requests");
  const requests: any[] = await response.json();
  const request = requests.find((r) => r.method === method && r.headers["traceparent"]);
  expect(request).toBeDefined();
  const [, traceId, spanId] = request.headers["traceparent"].match(TRACEPARENT);
  return { traceId, spanId };
}

async function click(label: string) {
  await $(`button=${label}`).click();
}

describe("Parent Trace Context", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must put fetch and XHR spans into the given trace, under the given parent span", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    await expect(browser).toHaveTitle("parent trace context test");

    await click("Set Parent");
    await click("Cross Origin Fetch");
    await click("Cross Origin XHR");

    await retry(async () => {
      for (const method of ["GET", "POST"]) {
        const span = (await exportedHttpSpans()).find((s) => s.method === method);
        expect(span).toEqual(
          expect.objectContaining({ traceId: PARENT_TRACE_ID, parentSpanId: PARENT_SPAN_ID, method })
        );

        const header = await receivedTraceparent(method);
        expect(header).toEqual({ traceId: PARENT_TRACE_ID, spanId: span!.spanId });
        expect(header.spanId).not.toBe(PARENT_SPAN_ID);
      }
    });

    expectNoBrowserErrors();
  });

  it("must start a new trace again once the parent is cleared", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    await expect(browser).toHaveTitle("parent trace context test");

    await click("Set Parent");
    await click("Clear Parent");
    await click("Cross Origin Fetch");

    await retry(async () => {
      const span = (await exportedHttpSpans()).find((s) => s.method === "GET");
      expect(span).toBeDefined();
      expect(span!.traceId).not.toBe(PARENT_TRACE_ID);
      expect(span!.parentSpanId).toBeUndefined();

      const header = await receivedTraceparent("GET");
      expect(header).toEqual({ traceId: span!.traceId, spanId: span!.spanId });
    });

    expectNoBrowserErrors();
  });

  it("must start a new trace when the traceparent is invalid", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    await expect(browser).toHaveTitle("parent trace context test");

    await click("Set Parent");
    await click("Set Invalid Parent");
    await click("Cross Origin XHR");

    await retry(async () => {
      const span = (await exportedHttpSpans()).find((s) => s.method === "POST");
      expect(span).toBeDefined();
      expect(span!.traceId).not.toBe(PARENT_TRACE_ID);
      expect(span!.parentSpanId).toBeUndefined();
    });

    expectNoBrowserErrors();
  });
});
