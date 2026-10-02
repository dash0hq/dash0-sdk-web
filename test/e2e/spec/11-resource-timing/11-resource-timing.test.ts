import { SPAN_KIND_CLIENT } from "../../../../src/semantic-conventions";
import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { loadPage, retry } from "../utils";
import {
  expectNoBrowserErrors,
  expectNoSpanMatching,
  expectSpanCountMatching,
  expectSpanMatching,
  spanAttribute,
} from "../expectations";

const PAGE = "/e2e/spec/11-resource-timing/page.html";

/**
 * The initiator type a browser reports is not uniform -- a `<link rel="stylesheet">` is "link" in
 * Chromium and "css" in some other engines -- so the tests assert that the attribute is present and
 * match the resource by URL instead.
 */
const anyInitiatorType = { key: "dash0.web.resource.initiator_type", value: { stringValue: expect.any(String) } };

function staticAssetSpan(path: string) {
  return expect.objectContaining({
    traceId: expect.any(String),
    spanId: expect.any(String),
    kind: SPAN_KIND_CLIENT,
    attributes: expect.arrayContaining([
      anyInitiatorType,
      { key: "http.request.method", value: { stringValue: "GET" } },
      { key: "url.path", value: { stringValue: path } },
      { key: "page.url.path", value: { stringValue: PAGE } },
    ]),
    events: expect.arrayContaining([
      expect.objectContaining({ name: "fetchStart" }),
      expect.objectContaining({ name: "responseEnd" }),
    ]),
    status: { code: 0 },
  });
}

describe("Resource Timing Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("must send a span for a stylesheet loaded before the SDK initialized", async () => {
    await loadPage(PAGE);
    await expect(browser).toHaveTitle("resource timing instrumentation test");

    // The stylesheet is referenced above the SDK snippet, so this only passes because the observer
    // replays the entries the browser buffered before init().
    await retry(async () => {
      await expectSpanMatching(staticAssetSpan("/e2e/spec/11-resource-timing/asset.css"));
    });
    expectNoBrowserErrors();
  });

  it("must send a span for a script loaded before the SDK initialized", async () => {
    await loadPage(PAGE);

    await retry(async () => {
      await expectSpanMatching(staticAssetSpan("/e2e/spec/11-resource-timing/asset.js"));
    });
    expectNoBrowserErrors();
  });

  it("must send a span for an image, carrying its transferred size", async () => {
    await loadPage(PAGE);

    await retry(async () => {
      await expectSpanMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/e2e/spec/11-resource-timing/asset.svg" } },
            { key: "http.response.body.size", value: { doubleValue: expect.any(Number) } },
          ]),
        })
      );
    });
    expectNoBrowserErrors();
  });

  it("must name spans after the initiator type and the file", async () => {
    await loadPage(PAGE);

    await retry(async () => {
      await expectSpanMatching(expect.objectContaining({ name: expect.stringContaining("asset.js") }));
    });
    expectNoBrowserErrors();
  });

  it("must not emit a resource span alongside the fetch instrumentation's own span", async () => {
    await loadPage(PAGE);

    const btn = await $("button=Fetch");
    await btn.click();

    await retry(async () => {
      // The fetch instrumentation's span, with the request detail resource timing cannot see.
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "http.response.status_code", value: { stringValue: "200" } },
          ]),
        })
      );
      // Exactly one span for that request: no duplicate from the resource observer, which would
      // otherwise double-count every API call the page makes.
      await expectSpanCountMatching(1, (span) => spanAttribute(span, "url.path") === "/ajax");
    });
    expectNoBrowserErrors();
  });

  it("must not emit spans for assets matching ignoreUrls", async () => {
    await loadPage(PAGE);

    const btn = await $("button=Load Ignored Image");
    await btn.click();

    // Give the image time to load and the observer time to deliver it, so this asserts an absence
    // rather than a race.
    await retry(async () => {
      await expectSpanMatching(staticAssetSpan("/e2e/spec/11-resource-timing/asset.css"));
    });
    await expectNoSpanMatching(
      expect.objectContaining({
        attributes: expect.arrayContaining([
          { key: "url.query", value: { stringValue: expect.stringContaining("you-cant-see-this") } },
        ]),
      })
    );
    expectNoBrowserErrors();
  });
});
