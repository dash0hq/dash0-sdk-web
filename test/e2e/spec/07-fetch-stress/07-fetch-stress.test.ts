import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { retry } from "../utils";
import { expectNoBrowserErrors, expectSpanCount } from "../expectations";

describe("Fetch Stress Test", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must handle many parallel requests with large bodies", async () => {
    await browser.url("/e2e/spec/07-fetch-stress/page.html");
    await expect(browser).toHaveTitle("fetch stress test");

    const startBtn = await $("button=Start Parallel Requests");
    await startBtn.click();

    // Wait for requests to start
    await browser.waitUntil(
      async () => {
        const statusEl = await $("#status");
        const text = await statusEl.getText();
        return text.includes("waiting for finish signal");
      },
      {
        timeout: 30000,
        timeoutMsg: "Requests did not start within 30 seconds",
      }
    );

    // Let the requests sit in a partially read state for a bit
    await browser.pause(2000);

    const finishBtn = await $("button=Finish Reading Responses");
    await finishBtn.click();

    // Wait for requests to finish
    await browser.waitUntil(
      async () => {
        const statusEl = await $("#status");
        const text = await statusEl.getText();
        return text.includes("Finished reading");
      },
      {
        timeout: 60000,
        timeoutMsg: "Requests did not finish within 60 seconds",
      }
    );

    // Wait a bit for spans to be sent
    await browser.pause(2000);

    // We should have received 50 spans (one for each request)
    await retry(async () => {
      await expectSpanCount(50);
    });

    expectNoBrowserErrors();
  });

  it("must handle requests that are never fully read", async () => {
    await browser.url("/e2e/spec/07-fetch-stress/page.html");
    await expect(browser).toHaveTitle("fetch stress test");

    const startBtn = await $("button=Start Parallel Requests");
    await startBtn.click();

    // Wait for requests to start
    await browser.waitUntil(
      async () => {
        const statusEl = await $("#status");
        const text = await statusEl.getText();
        return text.includes("waiting for finish signal");
      },
      {
        timeout: 30000,
        timeoutMsg: "Requests did not start within 30 seconds",
      }
    );

    // Don't finish reading, just wait to see if we get any errors
    await browser.pause(5000);

    // We should still get some spans eventually, even if responses aren't fully read
    // The instrumentation should handle this gracefully
    expectNoBrowserErrors();
  });
});
