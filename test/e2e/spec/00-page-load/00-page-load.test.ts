import { getOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { retry } from "../utils";
import { expectOneMatching } from "../expectations";

describe("Page Load", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("transmits page load logs", async () => {
    await browser.url("/e2e/spec/00-page-load/empty.html");
    await expect(await browser.getTitle()).toMatch(/empty page load test/);

    await retry(async () => {
      const requests = await getOTLPRequests();
      expectOneMatching(requests, (req) => {
        expect(req.path).toEqual("/v1/logs");

        // TODO check resource attributes, scope information, common signal attributes
      });
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
