import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";
import { PAGE_VIEW_TYPE_VALUES } from "../../../../src/semantic-conventions";

describe("Page Transition", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  describe("virtual page view events", () => {
    it("transmits virtual page view logs", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}#someFragment`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Do a transition");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(`/e2e/spec/05-page-transition/virtual-page?testId=${testId}`),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/05-page-transition/virtual-page" } },
              { key: "url.query", value: { stringValue: `testId=${testId}` } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
              { key: "the_answer", value: { doubleValue: 42 } },
              { key: "url_meta", value: { stringValue: "this is an url meta attribute" } },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                  { key: "title", value: { stringValue: expect.stringContaining("page transition test") } },
                  { key: "change_state", value: { stringValue: "pushState" } },
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
});
