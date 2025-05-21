import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { browser } from "@wdio/globals";
import { retry } from "../utils";
import { expectLogMatching } from "../expectations";

describe("Error Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  describe("on unhandled error", () => {
    it("transmits error logs", async () => {
      await browser.url("/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment");
      await expect(await browser.getTitle()).toMatch(/error-instrumentation test/);

      const btn = await $("button=Throw unhandled error");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "exception.message", value: { stringValue: expect.stringContaining("This is a hot potato") } },
              { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    "/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment"
                  ),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/03-error-instrumentation/page.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
              { key: "the_answer", value: { doubleValue: 42 } },
            ]),
            body: {
              stringValue: expect.stringContaining("This is a hot potato"),
            },
            severityNumber: 17,
            severityText: "ERROR",
            timeUnixNano: expect.any(String),
          })
        );
      });
    });
  });

  describe("on unhandled rejection", () => {
    it("transmits error logs", async () => {
      await browser.url("/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment");
      await expect(await browser.getTitle()).toMatch(/error-instrumentation test/);

      const btn = await $("button=Cause unhandled rejection");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              {
                key: "exception.message",
                value: { stringValue: "Unhandled promise rejection: This is a lava potato" },
              },
              { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    "/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment"
                  ),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/03-error-instrumentation/page.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
              { key: "the_answer", value: { doubleValue: 42 } },
            ]),
            body: {
              stringValue: "Unhandled promise rejection: This is a lava potato",
            },
            severityNumber: 17,
            severityText: "ERROR",
            timeUnixNano: expect.any(String),
          })
        );
      });
    });
  });

  describe("on error in event handler", () => {
    it("transmits error logs", async () => {
      await browser.url("/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment");
      await expect(await browser.getTitle()).toMatch(/error-instrumentation test/);

      const btn = await $("button=Throw error in event handler");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "exception.message", value: { stringValue: expect.stringContaining("This is a hot potato") } },
              { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    "/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment"
                  ),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/03-error-instrumentation/page.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
              { key: "the_answer", value: { doubleValue: 42 } },
            ]),
            body: {
              stringValue: expect.stringContaining("This is a hot potato"),
            },
            severityNumber: 17,
            severityText: "ERROR",
            timeUnixNano: expect.any(String),
          })
        );
      });
    });
  });

  describe("on error in timer", () => {
    it("transmits error logs", async () => {
      await browser.url("/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment");
      await expect(await browser.getTitle()).toMatch(/error-instrumentation test/);

      const btn = await $("button=Trigger error in timeout");
      await btn.click();

      await retry(async () => {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([
              { key: "exception.message", value: { stringValue: expect.stringContaining("This is a hot potato") } },
              { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
              { key: "page.load.id", value: { stringValue: expect.any(String) } },
              { key: "session.id", value: { stringValue: expect.any(String) } },
              { key: "user_agent.original", value: { stringValue: expect.any(String) } },
              {
                key: "url.full",
                value: {
                  stringValue: expect.stringContaining(
                    "/e2e/spec/03-error-instrumentation/page.html?thisIs=aTest#someFragment"
                  ),
                },
              },
              { key: "url.path", value: { stringValue: "/e2e/spec/03-error-instrumentation/page.html" } },
              { key: "url.fragment", value: { stringValue: "someFragment" } },
              { key: "url.query", value: { stringValue: "thisIs=aTest" } },
              { key: "url.scheme", value: { stringValue: expect.any(String) } },
              { key: "url.domain", value: { stringValue: expect.any(String) } },
              { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
              { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
              { key: "the_answer", value: { doubleValue: 42 } },
            ]),
            body: {
              stringValue: expect.stringContaining("This is a hot potato"),
            },
            severityNumber: 17,
            severityText: "ERROR",
            timeUnixNano: expect.any(String),
          })
        );
      });
    });
  });
});
