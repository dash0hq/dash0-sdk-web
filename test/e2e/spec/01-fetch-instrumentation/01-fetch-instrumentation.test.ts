import { SPAN_KIND_CLIENT } from "../../../../src/semantic-conventions";
import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { retry } from "../utils";
import { expectNoBrowserErrors, expectSpanCount, expectSpanMatching } from "../expectations";

describe("Fetch Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must send spans for fetch requests", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Same Origin Fetch");
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
            { key: "url.full", value: { stringValue: expect.stringContaining("/ajax") } },
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "url.scheme", value: { stringValue: "http" } },
            { key: "url.query", value: { stringValue: "thisIsA=test" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
            { key: "http.response.body.size", value: { doubleValue: expect.any(Number) } },
            { key: "http.request.header.x-test-header", value: { stringValue: "this is a green test" } },
            { key: "the_answer", value: { doubleValue: 42 } },
          ]),
          events: [
            {
              name: "fetchStart",
              timeUnixNano: expect.stringMatching(/\d*/),
              attributes: [],
            },
            expect.objectContaining({ name: "domainLookupStart" }),
            expect.objectContaining({ name: "domainLookupEnd" }),
            expect.objectContaining({ name: "connectStart" }),
            expect.objectContaining({ name: "connectEnd" }),
            expect.objectContaining({ name: "requestStart" }),
            expect.objectContaining({ name: "responseStart" }),
            expect.objectContaining({ name: "responseEnd" }),
          ],
          status: {
            code: 0,
            message: "OK",
          },
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must send spans for fetch requests with a Request object", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Fetch With Request Object");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP POST",
          attributes: expect.arrayContaining([
            { key: "http.request.method", value: { stringValue: "POST" } },
            { key: "url.full", value: { stringValue: expect.stringContaining("/ajax") } },
            { key: "http.request.header.x-test-header", value: { stringValue: "this is a yellow test" } },
          ]),
          status: {
            code: 0,
            message: "OK",
          },
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must send spans for fetch requests with a Request and init object", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Fetch With Request and Init");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP POST",
          attributes: expect.arrayContaining([
            { key: "http.request.method", value: { stringValue: "POST" } },
            { key: "url.full", value: { stringValue: expect.stringContaining("/ajax") } },
            { key: "http.request.header.x-test-header", value: { stringValue: "is this test green or yellow?" } },
          ]),
          status: {
            code: 0,
            message: "OK",
          },
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must ignore urls matching the ignoredUrls config", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn1 = await $("button=Fetch With Ignored URL");
    await btn1.click();

    const btn2 = await $("button=Same Origin Fetch");
    await btn2.click();

    await retry(async () => {
      await expectSpanCount(1);
      await expectSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "url.full", value: { stringValue: expect.stringContaining("/ajax?thisIsA=test") } },
          ]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must send an erroneous span on request failures", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Failing Fetch");
    await btn.click();

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "url.full", value: { stringValue: expect.stringContaining("/nothing-here") } },
          ]),
          events: expect.arrayContaining([
            expect.objectContaining({
              name: "exception",
              attributes: expect.arrayContaining([
                { key: "exception.type", value: { stringValue: expect.any(String) } },
                { key: "exception.message", value: { stringValue: expect.any(String) } },
                { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
              ]),
            }),
          ]),
          status: {
            code: 2,
            message: expect.not.stringContaining("Ok"),
          },
        })
      );
    });
  });

  it("must send body from init object", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Fetch With Body From Init");
    await btn.click();

    await retry(async () => {
      expect.objectContaining({
        attributes: expect.arrayContaining([
          { key: "url.full", value: { stringValue: expect.stringContaining("/ajax?assert-body") } },
          { key: "http.response.status_code", value: { stringValue: "200" } },
        ]),
      });
    });
    expectNoBrowserErrors();
  });

  it("must send body from Request instance", async () => {
    await browser.url("/e2e/spec/01-fetch-instrumentation/page.html");
    await expect(browser).toHaveTitle("fetch instrumentation test");

    const btn = await $("button=Fetch With Body From Request");
    await btn.click();

    await retry(async () => {
      expect.objectContaining({
        attributes: expect.arrayContaining([
          { key: "url.full", value: { stringValue: expect.stringContaining("/ajax?assert-body") } },
          { key: "http.response.status_code", value: { stringValue: "200" } },
        ]),
      });
    });
    expectNoBrowserErrors();
  });

  describe("with zonejs", () => {
    it("must not add any work to non-root zones", async () => {
      await browser.url("/e2e/spec/01-fetch-instrumentation/withZoneJs.html");
      await expect(browser).toHaveTitle("fetch with zonejs test");

      const btn = await $("button=Do A Fetch");
      await btn.click();

      await retry(async () => {
        await expectSpanMatching(
          expect.objectContaining({
            name: "HTTP GET",
            attributes: expect.arrayContaining([
              { key: "http.request.method", value: { stringValue: "GET" } },
              { key: "url.full", value: { stringValue: expect.stringContaining("/ajax") } },
            ]),
          })
        );
      });

      const resultElmnt = await $("#tasksScheduled");
      await expect(await resultElmnt.getText()).toEqual("0");

      expectNoBrowserErrors();
    });
  });
});
