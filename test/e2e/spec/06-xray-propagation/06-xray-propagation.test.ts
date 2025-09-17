import { SPAN_KIND_CLIENT } from "../../../../src/semantic-conventions";
import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { retry } from "../utils";
import { expectNoBrowserErrors, expectSpanCount, expectSpanMatching } from "../expectations";
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
describe("X-Ray Propagation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must send X-Ray headers for configured AWS endpoints", async () => {
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    await expect(browser).toHaveTitle("X-Ray propagation test");

    // Clear any previous requests
    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" })
        .then((data) => {
          // do something with data
        })
        .catch((rejected) => {
          console.log(rejected);
        });
    });

    // Navigate back to test page and make request
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    const btn = await $("button=Fetch with X-Ray Headers");
    await btn.click();

    // Check that X-Ray header was sent to server
    // we need to wait for all browaser calls are done (options + get)
    await sleep(500);

    const ajaxResponse = await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await browser.execute(() => {
      return JSON.parse(document.body.textContent);
    });
    const getRequest = ajaxRequests.find((req: any) => req.method == "GET");
    expect(getRequest.headers).toHaveProperty("x-amzn-trace-id");
    expect(getRequest.headers["x-amzn-trace-id"]).toMatch(
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=1$/
    );

    // Should not have traceparent header for X-Ray only endpoint
    expect(getRequest.headers).not.toHaveProperty("traceparent");

    expectNoBrowserErrors();
  });

  it("must send traceparent headers for configured API endpoints", async () => {
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    await expect(browser).toHaveTitle("X-Ray propagation test");

    // Clear any previous requests
    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" })
        .then((data) => {
          // do something with data
        })
        .catch((rejected) => {
          console.log(rejected);
        });
    });

    // Navigate back to test page and make request
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    const btn = await $("button=Fetch with Traceparent Headers");
    await btn.click();

    // Check that traceparent header was sent to server
    // we need to wait for all browaser calls are done (options + get)
    await sleep(500);

    const ajaxResponse = await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await browser.execute(() => {
      return JSON.parse(document.body.textContent);
    });
    const getRequest = ajaxRequests.find((req: any) => req.method == "GET");
    expect(getRequest.headers).toHaveProperty("traceparent");
    expect(getRequest.headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    // Should not have X-Ray header for traceparent only endpoint
    expect(ajaxRequests[0].headers).not.toHaveProperty("x-amzn-trace-id");

    expectNoBrowserErrors();
  });

  it("must not send headers for unconfigured endpoints", async () => {
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    await expect(browser).toHaveTitle("X-Ray propagation test");

    // Clear any previous requests
    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" })
        .then((data) => {
          // do something with data
        })
        .catch((rejected) => {
          console.log(rejected);
        });
    });

    // Navigate back to test page and make request
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    const btn = await $("button=Fetch with No Headers");
    await btn.click();

    // Check that no trace headers were sent
    // we need to wait for all browaser calls are done (options + get)
    await sleep(500);

    const ajaxResponse = await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await browser.execute(() => {
      return JSON.parse(document.body.textContent);
    });

    const getRequest = ajaxRequests.find((req: any) => req.method == "GET");

    expect(getRequest.headers).not.toHaveProperty("traceparent");
    expect(getRequest.headers).not.toHaveProperty("x-amzn-trace-id");

    expectNoBrowserErrors();
  });

  it("must send traceparent headers for same-origin requests (legacy behavior)", async () => {
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    await expect(browser).toHaveTitle("X-Ray propagation test");

    // Clear any previous requests
    await browser.execute(async () => {
      await fetch("http://localhost.lambdatest.com:8012/ajax-requests", { method: "DELETE" })
        .then((data) => {
          // do something with data
        })
        .catch((rejected) => {
          console.log(rejected);
        });
    });

    // Navigate back to test page and make request
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    const btn = await $("button=Same Origin Fetch");
    await btn.click();

    // For same-origin, headers should still be added (legacy behavior)
    // we need to wait for all browaser calls are done (options + get)
    await sleep(500);

    const ajaxResponse = await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await browser.execute(() => {
      return JSON.parse(document.body.textContent);
    });

    const getRequest = ajaxRequests.find((req: any) => req.method == "GET");

    expect(getRequest.headers).toHaveProperty("traceparent");
    expect(getRequest.headers).not.toHaveProperty("x-amzn-trace-id");

    expectNoBrowserErrors();
  });

  it("must send both headers when multiple propagators match the same URL", async () => {
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    await expect(browser).toHaveTitle("X-Ray propagation test");

    // Clear any previous requests
    await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");

    // Navigate back to test page and make request
    await browser.url("/e2e/spec/06-xray-propagation/page.html");
    const btn = await $("button=Fetch with traceparent and xray Headers");
    await btn.click();

    // Check that BOTH headers were sent to server
    // we need to wait for all browaser calls are done (options + get)
    await sleep(500);

    const ajaxResponse = await browser.url("http://localhost.lambdatest.com:8012/ajax-requests");
    const ajaxRequests = await browser.execute(() => {
      return JSON.parse(document.body.textContent);
    });
    const getRequest = ajaxRequests.find((req: any) => req.method == "GET");

    // Both headers should be present
    expect(getRequest.headers).toHaveProperty("traceparent");
    expect(getRequest.headers).toHaveProperty("x-amzn-trace-id");

    // Verify header formats
    expect(getRequest.headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(getRequest.headers["x-amzn-trace-id"]).toMatch(
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=1$/
    );

    // Verify both headers use the same trace ID (converted format)
    const traceparentMatch = getRequest.headers["traceparent"].match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/);
    const xrayMatch = getRequest.headers["x-amzn-trace-id"].match(
      /^Root=1-([0-9a-f]{8})-([0-9a-f]{24});Parent=([0-9a-f]{16});Sampled=1$/
    );

    expect(traceparentMatch).toBeTruthy();
    expect(xrayMatch).toBeTruthy();

    // X-Ray trace ID should be converted W3C format: timestamp (8 chars) + unique ID (24 chars)
    const w3cTraceId = traceparentMatch[1];
    const xrayTimestamp = xrayMatch[1];
    const xrayUniqueId = xrayMatch[2];

    expect(w3cTraceId).toBe(xrayTimestamp + xrayUniqueId);
    expect(traceparentMatch[2]).toBe(xrayMatch[3]); // Same span ID

    expectNoBrowserErrors();
  });
});
