import { SPAN_KIND_CLIENT } from "../../../../src/semantic-conventions";
import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { loadPage, retry } from "../utils";
import { expectNoBrowserErrors, expectNoSpanMatching, expectSpanMatching } from "../expectations";

describe("XHR Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must send spans for same-origin XHR requests with the same shape as fetch spans", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Same Origin XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          traceId: expect.any(String),
          spanId: expect.any(String),
          name: "HTTP GET",
          kind: SPAN_KIND_CLIENT,
          attributes: expect.arrayContaining([
            { key: "http.request.method", value: { stringValue: "GET" } },
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
            { key: "http.request.header.x-test-header", value: { stringValue: "this is a green test" } },
          ]),
          status: { code: 0 },
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must inject traceparent for matching cross-origin XHR requests", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" }).catch(() => {});
    });

    const btn = await $("button=Cross Origin XHR");
    await btn.click();

    await retry(async () => {
      // The page targets `http://${window.location.hostname}:8012`, so the hostname differs
      // between local runs and remote (LambdaTest) runs -- match on method and path only.
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP POST",
          attributes: expect.arrayContaining([
            { key: "http.request.method", value: { stringValue: "POST" } },
            { key: "url.path", value: { stringValue: "/ajax" } },
          ]),
        })
      );

      const ajaxResponse = await fetch("http://localhost.lambdatest.com:8012/ajax-requests");
      const ajaxRequests = await ajaxResponse.json();
      const postRequest = ajaxRequests.find((req: any) => req.method == "POST");

      expect(postRequest).toBeDefined();
      expect(postRequest.headers).toHaveProperty("traceparent");
      expect(postRequest.headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    expectNoBrowserErrors();
  });

  it("must send X-Ray headers for the same-origin XHR X-Ray case", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" }).catch(() => {});
    });

    const btn = await $("#xray-xhr-btn");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/aws" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
          ]),
        })
      );
    });

    const ajaxResponse = await fetch("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await ajaxResponse.json();
    const awsRequest = ajaxRequests.find((req: any) => req.url.startsWith("/aws"));

    expect(awsRequest).toBeDefined();
    expect(awsRequest.headers).toHaveProperty("x-amzn-trace-id");
    expect(awsRequest.headers["x-amzn-trace-id"]).toMatch(
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=1$/
    );
    // Same-origin requests receive ALL configured propagator types, so traceparent must be present too.
    expect(awsRequest.headers).toHaveProperty("traceparent");
    expect(awsRequest.headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    expectNoBrowserErrors();
  });

  it("must ignore urls matching the ignoredUrls config for XHR", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const ignoredBtn = await $("button=XHR With Ignored URL");
    await ignoredBtn.click();

    const okBtn = await $("button=Same Origin XHR");
    await okBtn.click();

    await retry(async () => {
      // Gate on the non-ignored span first -- once it has arrived, the ignored request's span
      // (fired back-to-back with it, so batched together if it existed) must not be present.
      await expectSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([{ key: "url.path", value: { stringValue: "/ajax" } }]),
        })
      );
      await expectNoSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([{ key: "url.path", value: { stringValue: "/you-cant-see-this" } }]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must instrument synchronous XHR requests the same as asynchronous ones", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Sync XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.query", value: { stringValue: "sync=test" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
          ]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must send an erroneous span when an XHR request fails", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Failing XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "url.query", value: { stringValue: "xhr=async-error" } },
            { key: "error.type", value: { stringValue: "error" } },
          ]),
          events: expect.arrayContaining([
            expect.objectContaining({
              name: "exception",
              attributes: expect.arrayContaining([
                { key: "exception.type", value: { stringValue: "error" } },
                { key: "exception.message", value: { stringValue: expect.stringContaining("XMLHttpRequest failed") } },
              ]),
            }),
          ]),
          status: expect.objectContaining({ code: 2 }),
        })
      );
    });
    // No expectNoBrowserErrors() here: browsers log the failed network request as a console error.
  });

  it("must send an erroneous span with error.type timeout when an XHR request times out", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Timeout XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/delay-fetch" } },
            { key: "url.query", value: { stringValue: "xhr=timeout" } },
            { key: "error.type", value: { stringValue: "timeout" } },
          ]),
          events: expect.arrayContaining([
            expect.objectContaining({
              name: "exception",
              attributes: expect.arrayContaining([
                { key: "exception.type", value: { stringValue: "timeout" } },
                { key: "exception.message", value: { stringValue: expect.stringContaining("XMLHttpRequest failed") } },
              ]),
            }),
          ]),
          status: expect.objectContaining({ code: 2 }),
        })
      );
    });
    // No expectNoBrowserErrors() here: browsers log the timed-out request as a console error.
  });

  it("must mark aborted XHR requests as cancelled, not failed", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Aborted XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.query", value: { stringValue: "xhr=abort" } },
            { key: "dash0.web.request.cancelled", value: { boolValue: true } },
          ]),
          status: expect.objectContaining({ code: 0 }),
          events: expect.not.arrayContaining([expect.objectContaining({ name: "exception" })]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must pass the request body through unchanged", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=XHR With Body");
    await btn.click();

    await retry(async () => {
      // The server compares the received body against the assert-body query parameter and
      // responds 400 on mismatch, so a 200 proves the body arrived unchanged.
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP POST",
          attributes: expect.arrayContaining([
            { key: "url.full", value: { stringValue: expect.stringContaining("/ajax?assert-body") } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
          ]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must send an erroneous span when a synchronous XHR request fails", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Failing Sync XHR");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.query", value: { stringValue: "xhr=sync-error" } },
            { key: "error.type", value: { stringValue: "error" } },
          ]),
          events: expect.arrayContaining([
            expect.objectContaining({
              name: "exception",
              // The real DOMException thrown by sync send() is recorded here; browsers differ
              // on whether the legacy numeric code or the name is reported -- assert loosely.
              attributes: expect.arrayContaining([
                { key: "exception.type", value: { stringValue: expect.any(String) } },
                { key: "exception.message", value: { stringValue: expect.any(String) } },
              ]),
            }),
          ]),
          status: expect.objectContaining({ code: 2 }),
        })
      );
    });
    // No expectNoBrowserErrors() here: browsers log the failed network request as a console error.
  });

  it("must send spans for axios requests (axios defaults to the XHR adapter in browsers)", async () => {
    await loadPage("/e2e/spec/09-xhr-instrumentation/page.html");
    await expect(browser).toHaveTitle("xhr instrumentation test");

    const btn = await $("button=Axios GET");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          kind: SPAN_KIND_CLIENT,
          attributes: expect.arrayContaining([
            { key: "http.request.method", value: { stringValue: "GET" } },
            { key: "url.query", value: { stringValue: "thisIsAxios=test" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
          ]),
          status: { code: 0 },
        })
      );
    });
    expectNoBrowserErrors();
  });
});
