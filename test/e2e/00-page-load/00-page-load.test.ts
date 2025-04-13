import { test, expect } from "@playwright/test";
import { expectOneMatching, getOTLPRequests, retry, sharedBeforeEach } from "../shared";

test.beforeEach(sharedBeforeEach);

test("transmits page load logs", async ({ page }) => {
  await page.goto("/e2e/00-page-load/empty.html");
  await expect(page).toHaveTitle(/empty page load test/);

  await retry(async () => {
    const requests = await getOTLPRequests();
    expectOneMatching(requests, (req) => {
      expect(req.path).toEqual("/v1/logs");

      // TODO check resource attributes, scope information, common signal attributes
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
