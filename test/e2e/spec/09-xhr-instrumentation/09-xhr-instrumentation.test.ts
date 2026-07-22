import { SPAN_KIND_CLIENT } from "../../../../src/semantic-conventions";
import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { loadPage, retry } from "../utils";
import { expectNoBrowserErrors, expectSpanCount, expectSpanMatching } from "../expectations";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    await sleep(500);

    const ajaxResponse = await fetch("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await ajaxResponse.json();
    const postRequest = ajaxRequests.find((req: any) => req.method == "POST");

    expect(postRequest).toBeDefined();
    expect(postRequest.headers).toHaveProperty("traceparent");
    expect(postRequest.headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

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
      await expectSpanCount(1);
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
