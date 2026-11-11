import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { loadPage, retry } from "../utils";
import { expectLogMatching, expectNoLogMatching } from "../expectations";

describe("Console Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("transmits console messages of the configured levels", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`/e2e/spec/12-console-instrumentation/page.html?testId=${testId}`);

    await (await $("button=Log")).click();
    await (await $("button=Error")).click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.console" } },
            { key: "browser.console.method", value: { stringValue: "log" } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
            { key: "page.url.query", value: { stringValue: `testId=${testId}` } },
          ]),
          body: { stringValue: 'cart updated: {"items":3}' },
          severityNumber: 9,
          severityText: "INFO",
        })
      );

      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.console" } },
            { key: "browser.console.method", value: { stringValue: "error" } },
            { key: "exception.type", value: { stringValue: "TypeError" } },
            { key: "exception.message", value: { stringValue: "price is undefined" } },
            { key: "exception.stacktrace", value: { stringValue: expect.any(String) } },
          ]),
          body: { stringValue: "checkout failed: TypeError: price is undefined" },
          severityNumber: 17,
          severityText: "ERROR",
        })
      );
    });

    await expectNoLogMatching(expect.objectContaining({ body: { stringValue: "info is not captured" } }));
    await expectNoLogMatching(expect.objectContaining({ body: { stringValue: "please ignore me" } }));
  });
});
