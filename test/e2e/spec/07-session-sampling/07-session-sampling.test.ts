import { getOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { browser } from "@wdio/globals";
import { delay, retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";

describe("Session Sampling", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("transmits telemetry when sessionSamplingRate is 100", async () => {
    await browser.url("/e2e/spec/07-session-sampling/page.html?sampling-rate=100");
    await expect(await browser.getTitle()).toMatch(/session-sampling test/);

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.page_view" } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
          ]),
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("does not transmit any telemetry when sessionSamplingRate is 0", async () => {
    await browser.url("/e2e/spec/07-session-sampling/page.html?sampling-rate=0");
    await expect(await browser.getTitle()).toMatch(/session-sampling test/);

    // Wait long enough for any telemetry to arrive if it were being sent.
    await delay(5000);

    const requests = await getOTLPRequests();
    expect(requests).toHaveLength(0);

    expectNoBrowserErrors();
  });
});
