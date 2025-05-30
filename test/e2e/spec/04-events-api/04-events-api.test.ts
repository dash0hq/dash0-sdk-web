import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { retry } from "../utils";
import { expectLogMatching } from "../expectations";

describe("Events Api", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("transmits an event", async () => {
    const testId = generateUniqueId(16);
    await browser.url(`/e2e/spec/04-events-api/page.html?testId=${testId}#someFragment`);
    await expect(await browser.getTitle()).toMatch(/events-api test/);

    const btn = await $("button=Send Event");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "snacks_appeared" } },
            { key: "snack.kind", value: { stringValue: "ice cream" } },
            { key: "page.load.id", value: { stringValue: expect.any(String) } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
            { key: "user_agent.original", value: { stringValue: expect.any(String) } },
            {
              key: "url.full",
              value: {
                stringValue: expect.stringContaining(`/e2e/spec/04-events-api/page.html?testId=${testId}#someFragment`),
              },
            },
            { key: "url.path", value: { stringValue: "/e2e/spec/04-events-api/page.html" } },
            { key: "url.fragment", value: { stringValue: "someFragment" } },
            { key: "url.query", value: { stringValue: `testId=${testId}` } },
            { key: "url.scheme", value: { stringValue: expect.any(String) } },
            { key: "url.domain", value: { stringValue: expect.any(String) } },
            { key: "browser.window.width", value: { doubleValue: expect.any(Number) } },
            { key: "browser.window.height", value: { doubleValue: expect.any(Number) } },
            { key: "the_answer", value: { doubleValue: 42 } },
          ]),
          body: {
            stringValue: "This is an event",
          },
          severityNumber: 9,
          severityText: "INFO",
          timeUnixNano: expect.any(String),
        })
      );
    });
  });
});
