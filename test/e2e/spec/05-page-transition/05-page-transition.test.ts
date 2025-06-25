import { clearOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { delay, retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors, expectNoLogMatching } from "../expectations";
import { PAGE_VIEW_TYPE_VALUES } from "../../../../src/semantic-conventions";

describe("Page Transition", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  describe("virtual page view events", () => {
    it("transmits virtual page view logs on history.pushState", async () => {
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

    it("transmits virtual page views on history.replaceState", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Call history.replaceState");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(`/e2e/spec/05-page-transition/virtual-page?testId=${testId}`),
                },
              },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                  { key: "change_state", value: { stringValue: "replaceState" } },
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

    it("transmits virtual page view logs on history.go", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Do a transition");
      await btn.click();
      await delay(1000);
      await clearOTLPRequests();
      const btn2 = await $("button=Call history.go");
      await btn2.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(`/e2e/spec/05-page-transition/page.html?testId=${testId}`),
                },
              },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
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

    it("transmits virtual page view logs on history.back", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Do a transition");
      await btn.click();
      await delay(1000);
      await clearOTLPRequests();
      const btn2 = await $("button=Call history.go");
      await btn2.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(`/e2e/spec/05-page-transition/page.html?testId=${testId}`),
                },
              },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
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

    it("transmits virtual page view logs on history.forward", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Do a transition");
      await btn.click();
      const btn2 = await $("button=Call history.go");
      await btn2.click();
      await delay(1000);
      await clearOTLPRequests();
      const btn3 = await $("button=Call history.forward");
      await btn3.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(`/e2e/spec/05-page-transition/virtual-page?testId=${testId}`),
                },
              },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
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

    it("transmits events on query changes if enabled", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}&include-parts=SEARCH`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Change url.search");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    `/e2e/spec/05-page-transition/page.html?testId=${testId}&include-parts=SEARCH&ice-cream=true`
                  ),
                },
              },
              { key: "url.query", value: { stringValue: `testId=${testId}&include-parts=SEARCH&ice-cream=true` } },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
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

    it("transmits events on fragment changes if enabled", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}&include-parts=HASH`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Change url.fragment");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.page_view" } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    `/e2e/spec/05-page-transition/page.html?testId=${testId}&include-parts=HASH#someNewFragment`
                  ),
                },
              },
              { key: "url.fragment", value: { stringValue: "someNewFragment" } },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
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

    it("does nothing if the url does not change", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      await delay(1000);
      await clearOTLPRequests();
      const btn = await $("button=Change history.state");
      await btn.click();

      await retry(async () => {
        await expectNoLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                ]),
              },
            },
          })
        );
      });

      expectNoBrowserErrors();
    });

    it("does nothing if trackVirtualPageViews is false", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}&disable-page-view-tracking=true`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      await delay(1000);
      await clearOTLPRequests();
      const btn = await $("button=Do a transition");
      await btn.click();

      await retry(async () => {
        await expectNoLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                ]),
              },
            },
          })
        );
      });

      expectNoBrowserErrors();
    });

    it("ignores fragment changes if not enabled", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      await delay(1000);
      await clearOTLPRequests();
      const btn = await $("button=Change url.fragment");
      await btn.click();

      await retry(async () => {
        await expectNoLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                ]),
              },
            },
          })
        );
      });

      expectNoBrowserErrors();
    });

    it("ignores query changes if not enabled", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      await delay(1000);
      await clearOTLPRequests();
      const btn = await $("button=Change url.search");
      await btn.click();

      await retry(async () => {
        await expectNoLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                ]),
              },
            },
          })
        );
      });

      expectNoBrowserErrors();
    });

    it("uses custom page titles if provided", async () => {
      const testId = generateUniqueId(16);
      await browser.url(`/e2e/spec/05-page-transition/page.html?testId=${testId}&useCustomTitle=true`);
      await expect(await browser.getTitle()).toMatch(/page transition test/);

      const btn = await $("button=Do a transition");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: PAGE_VIEW_TYPE_VALUES.VIRTUAL } },
                  { key: "title", value: { stringValue: expect.stringContaining("this is a custom title") } },
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
