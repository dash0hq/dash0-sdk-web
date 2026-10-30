import { sharedAfterEach, sharedBeforeEach, getOTLPRequests } from "../shared";
import { loadPage, retry } from "../utils";
import { expectNoBrowserErrors } from "../expectations";
import { ExportTraceServiceRequest } from "../../../../src/types/otlp";

const PARENT_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_SPAN_ID = "00f067aa0ba902b7";
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

type ExportedSpan = { traceId: string; spanId: string; parentSpanId?: string; method?: string; url?: string };

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
      url: span.attributes.find((a) => a.key === "url.full")?.value.stringValue,
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

  it("must apply a queued parent to fetch and XHR spans", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    await expect(browser).toHaveTitle("parent trace context test");

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

  it("must preserve the parent when the traceparent is invalid", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    await expect(browser).toHaveTitle("parent trace context test");

    await click("Set Parent");
    await click("Set Invalid Parent");
    await click("Cross Origin Fetch");
    await click("Cross Origin XHR");

    await retry(async () => {
      for (const method of ["GET", "POST"]) {
        const span = (await exportedHttpSpans()).find((s) => s.method === method);
        expect(span).toEqual(expect.objectContaining({ traceId: PARENT_TRACE_ID, parentSpanId: PARENT_SPAN_ID }));
        expect(await receivedTraceparent(method)).toEqual({ traceId: PARENT_TRACE_ID, spanId: span!.spanId });
      }
    });

    expectNoBrowserErrors();
  });

  it("must snapshot each fetch and XHR parent at start across replacement and clearing", async () => {
    await loadPage("/e2e/spec/11-parent-trace-context/page.html");
    const nextTraceId = "0af7651916cd43dd8448eb211c80319c";
    const nextSpanId = "b7ad6b7169203331";

    await browser.execute(
      async (nextTraceId, nextSpanId) => {
        const dash0 = (window as any).dash0;
        const pending: Promise<unknown>[] = [];
        for (const stage of ["first", "second", "cleared"]) {
          const url = `http://${window.location.hostname}:8012/ajax?cors=true&stage=${stage}`;
          const xhr = new XMLHttpRequest();
          xhr.open("POST", url);
          if (stage === "first") {
            dash0("setParentTraceContext", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
          } else if (stage === "second") {
            dash0("setParentTraceContext", `00-${nextTraceId}-${nextSpanId}-01`);
          } else {
            dash0("setParentTraceContext", undefined);
          }
          pending.push(fetch(url).then((response) => response.text()));
          pending.push(
            new Promise<void>((resolve, reject) => {
              xhr.onload = () => resolve();
              xhr.onerror = () => reject(new Error("Local XHR failed"));
              xhr.send();
            })
          );
        }
        await Promise.all(pending);
      },
      nextTraceId,
      nextSpanId
    );

    await retry(async () => {
      const spans = await exportedHttpSpans();
      expect(spans).toHaveLength(6);
      const response = await fetch("http://127.0.0.1:8012/ajax-requests");
      const requests: any[] = await response.json();
      for (const stage of ["first", "second", "cleared"]) {
        for (const method of ["GET", "POST"]) {
          const span = spans.find((s) => s.method === method && s.url?.includes(`stage=${stage}`))!;
          expect(span).toBeDefined();
          if (stage === "cleared") {
            expect(span.traceId).toMatch(/^d042/);
            expect(span.parentSpanId).toBeUndefined();
          } else {
            expect(span).toEqual(
              expect.objectContaining({
                traceId: stage === "first" ? PARENT_TRACE_ID : nextTraceId,
                parentSpanId: stage === "first" ? PARENT_SPAN_ID : nextSpanId,
              })
            );
          }
          const request = requests.find((r) => r.method === method && r.url.includes(`stage=${stage}`));
          expect(request.headers.traceparent).toBe(`00-${span.traceId}-${span.spanId}-01`);
        }
      }
    });

    expectNoBrowserErrors();
  });
});
