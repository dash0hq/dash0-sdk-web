import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";
import { browser } from "@wdio/globals";

describe("Page Load", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  describe("page load events", () => {
    it("transmits page load logs", async () => {
      await browser.url("/e2e/spec/00-page-load/empty.html?thisIs=aTest#someFragment");
      // make sure we actually have a new page load. urls with fragments don't always trigger a new navigation
      await browser.refresh();
      await expect(await browser.getTitle()).toMatch(/empty page load test/);

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
                  stringValue: expect.stringContaining("/e2e/spec/00-page-load/empty.html?thisIs=aTest#someFragment"),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/00-page-load/empty.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "type", value: { doubleValue: 0 } },
                  { key: "title", value: { stringValue: expect.stringContaining("empty page load test") } },
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

  describe("navigation timing events", () => {
    it("transmits navigation timing logs", async () => {
      await browser.url("/e2e/spec/00-page-load/empty.html?thisIs=aTest#someFragment");
      // make sure we actually have a new page load. urls with fragments don't always trigger a new navigation
      await browser.refresh();
      await expect(await browser.getTitle()).toMatch(/empty page load test/);

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "event.name", value: { stringValue: "browser.navigation_timing" } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining("/e2e/spec/00-page-load/empty.html?thisIs=aTest#someFragment"),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/00-page-load/empty.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
            ]),
            body: {
              kvlistValue: {
                values: expect.arrayContaining([
                  { key: "name", value: { stringValue: expect.any(String) } },
                  { key: "responseStatus", value: { doubleValue: 200 } },
                  { key: "fetchStart", value: { doubleValue: expect.any(Number) } },
                  { key: "requestStart", value: { doubleValue: expect.any(Number) } },
                  { key: "responseStart", value: { doubleValue: expect.any(Number) } },
                  { key: "domInteractive", value: { doubleValue: expect.any(Number) } },
                  { key: "domContentLoadedEventEnd", value: { doubleValue: expect.any(Number) } },
                  { key: "domComplete", value: { doubleValue: expect.any(Number) } },
                  { key: "loadEventEnd", value: { doubleValue: expect.any(Number) } },
                  { key: "transferSize", value: { doubleValue: expect.any(Number) } },
                  { key: "encodedBodySize", value: { doubleValue: expect.any(Number) } },
                  { key: "decodedBodySize", value: { doubleValue: expect.any(Number) } },
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

// TODO tests for
//  trace id via meta tag
//  trace id via server timing response header
//  user meta data
//  web vitals
//  navigation timings
//  session data (enabled/disabled)
