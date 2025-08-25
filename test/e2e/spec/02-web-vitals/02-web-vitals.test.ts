import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { browser } from "@wdio/globals";
import { retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";
import { generateUniqueId } from "../../../../src/utils";
import { supportsLCPWebVital } from "../browser-compat";

describe("Web Vitals", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  // the classic function usage is important here, otherwise this.skip won't be available
  it("transmits web vitals logs", async function () {
    if (!supportsLCPWebVital()) {
      this.skip();
    }

    const testId = generateUniqueId(16);
    await browser.url(`/e2e/spec/02-web-vitals/page.html?testId=${testId}#someFragment`);
    await expect(await browser.getTitle()).toMatch(/web-vitals test/);

    // We need some interaction to trigger the web vital calculation
    const btn = await $("button=You better click me!");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.web_vital" } },
            { key: "page.load.id", value: { stringValue: expect.any(String) } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
            { key: "user_agent.original", value: { stringValue: expect.any(String) } },
            {
              key: "page.url.full",
              value: {
                stringValue: expect.stringContaining(`/e2e/spec/02-web-vitals/page.html?testId=${testId}#someFragment`),
              },
            },
            { key: "page.url.path", value: { stringValue: "/e2e/spec/02-web-vitals/page.html" } },
            { key: "page.url.fragment", value: { stringValue: "someFragment" } },
            { key: "page.url.query", value: { stringValue: `testId=${testId}` } },
            { key: "page.url.scheme", value: { stringValue: expect.any(String) } },
            { key: "page.url.domain", value: { stringValue: expect.any(String) } },
            { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
            { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
            { key: "the_answer", value: { doubleValue: 42 } },
          ]),
          body: {
            kvlistValue: {
              values: expect.arrayContaining([
                { key: "name", value: { stringValue: "LCP" } },
                { key: "value", value: { doubleValue: expect.any(Number) } },
                { key: "delta", value: { doubleValue: expect.any(Number) } },
              ]),
            },
          },
          severityNumber: 9,
          severityText: "INFO",
          timeUnixNano: expect.any(String),
        })
      );
    });

    expectNoBrowserErrors();
  });
});
