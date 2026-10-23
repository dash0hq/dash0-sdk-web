import { getOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { browser } from "@wdio/globals";
import { delay, retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";

// Every WebDriver session sets navigator.webdriver, so these tests are themselves synthetic traffic of type "test".
describe("Synthetic Traffic", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("tags telemetry from automated browsers", async () => {
    await browser.url("/e2e/spec/11-synthetic-traffic/page.html");
    await expect(await browser.getTitle()).toMatch(/synthetic-traffic test/);

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.page_view" } },
            { key: "user_agent.synthetic.type", value: { stringValue: "test" } },
          ]),
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("transmits nothing when automated browsers are ignored", async () => {
    await browser.url("/e2e/spec/11-synthetic-traffic/page.html?tests=ignore");
    await expect(await browser.getTitle()).toMatch(/synthetic-traffic test/);

    // Wait long enough for any telemetry to arrive if it were being sent.
    await delay(5000);

    const requests = await getOTLPRequests();
    expect(requests).toHaveLength(0);

    expectNoBrowserErrors();
  });
});
