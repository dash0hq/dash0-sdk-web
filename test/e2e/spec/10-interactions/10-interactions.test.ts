import { getOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { loadPage, retry } from "../utils";
import {
  expectLogMatching,
  expectNoBrowserErrors,
  expectNoLogMatching,
  expectSpanMatching,
  getLogRecords,
  getSpans,
  getStringAttribute,
} from "../expectations";

const PAGE_PATH = "/e2e/spec/10-interactions/page.html";
const DISABLED_PAGE_PATH = "/e2e/spec/10-interactions/page-disabled.html";

/**
 * Resolves the `interaction.id` the `browser.interaction` event for a given
 * click target carried, throwing when the event has not arrived yet so the
 * caller's retry() keeps polling.
 */
async function getInteractionIdForTarget(targetId: string): Promise<string> {
  const record = (await getLogRecords()).find(
    (lr: any) =>
      getStringAttribute(lr, "event.name") === "browser.interaction" &&
      getStringAttribute(lr, "interaction.target.id") === targetId
  );

  const interactionId = record && getStringAttribute(record, "interaction.id");
  if (!interactionId) {
    throw new Error(`No browser.interaction event with an interaction.id for target #${targetId} received yet`);
  }
  return interactionId;
}

describe("Interaction Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("emits a browser.interaction log with the custom action name when a data-dash0-action-name button is clicked", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);
    await expect(await browser.getTitle()).toMatch(/interactions test/);

    const btn = await $("#save-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: "browser.interaction" } },
            { key: "page.load.id", value: { stringValue: expect.any(String) } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
            { key: "the_answer", value: { doubleValue: 42 } },
            { key: "interaction.id", value: { stringValue: expect.any(String) } },
            { key: "interaction.type", value: { stringValue: "click" } },
            { key: "interaction.name", value: { stringValue: "Save Settings" } },
            { key: "interaction.name_source", value: { stringValue: "custom_attribute" } },
            { key: "interaction.target.tag", value: { stringValue: "button" } },
            { key: "interaction.target.id", value: { stringValue: "save-button" } },
            { key: "interaction.target.selector", value: { stringValue: "button#save-button" } },
          ]),
          body: { stringValue: `Click "Save Settings" on ${PAGE_PATH}` },
          severityNumber: 9,
          severityText: "INFO",
          timeUnixNano: expect.any(String),
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("derives the name from visible text when no custom attribute or aria-label is present", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const btn = await $("#plain-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "interaction.name", value: { stringValue: "Continue" } },
            { key: "interaction.name_source", value: { stringValue: "text_content" } },
            { key: "interaction.target.id", value: { stringValue: "plain-button" } },
            { key: "interaction.target.selector", value: { stringValue: "button#plain-button" } },
          ]),
          body: { stringValue: `Click "Continue" on ${PAGE_PATH}` },
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("derives the name from aria-label for an icon-only button with no visible text", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const btn = await $("#icon-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "interaction.name", value: { stringValue: "Close Dialog" } },
            { key: "interaction.name_source", value: { stringValue: "standard_attribute" } },
            { key: "interaction.target.id", value: { stringValue: "icon-button" } },
            { key: "interaction.target.selector", value: { stringValue: "button#icon-button" } },
          ]),
          body: { stringValue: `Click "Close Dialog" on ${PAGE_PATH}` },
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("never derives a name from a text input's value, even though it has a pre-filled value", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const input = await $("#text-input");
    await input.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "interaction.target.id", value: { stringValue: "text-input" } },
            { key: "interaction.target.tag", value: { stringValue: "input" } },
            // The input's only available name source is its `placeholder` attribute
            // (an input's value is only ever read for button/submit/reset types, and
            // its text is never collected -- see VALUE_READABLE_INPUT_TYPES /
            // TEXT_EXCLUDED_TAGS in src/instrumentations/interactions/action-name.ts).
            // The pre-filled `value="pre-filled secret"` must never leak into the
            // emitted log.
            { key: "interaction.name", value: { stringValue: "Type here" } },
            { key: "interaction.name_source", value: { stringValue: "standard_attribute" } },
          ]),
        })
      );

      const logRecords = await getLogRecords();
      const interactionRecord = logRecords.find(
        (lr: any) => getStringAttribute(lr, "interaction.target.id") === "text-input"
      ) as any;

      expect(interactionRecord.attributes.map((kv: any) => kv.value?.stringValue)).not.toContain("pre-filled secret");
      expect(interactionRecord.body?.stringValue).not.toContain("pre-filled secret");
    });

    expectNoBrowserErrors();
  });

  it("never leaks a wrapped control's value when the name comes from an ancestor label's text", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const labelText = await $("#notes-label-text");
    await labelText.click();

    await retry(async () => {
      // Positive signal FIRST: retry() resolves on the first success, so a bare
      // negative assertion would pass vacuously before any log arrived. The
      // exact-match body assertion is itself part of the privacy check.
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "interaction.target.id", value: { stringValue: "notes-label-text" } },
            { key: "interaction.name", value: { stringValue: "Notes" } },
            { key: "interaction.name_source", value: { stringValue: "text_content" } },
          ]),
          body: { stringValue: `Click "Notes" on ${PAGE_PATH}` },
        })
      );

      // Only meaningful now that the expected record has been received: the
      // wrapped textarea's value must appear nowhere we transmitted -- not in a
      // log attribute, not in a body, and not on a span's user_interaction.name.
      const requests = await getOTLPRequests();
      expect(JSON.stringify(requests)).not.toContain("TEXTAREA-SECRET-4471");
    });

    expectNoBrowserErrors();
  });

  it("never leaks a control nested inside an aria-labelledby target", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const btn = await $("#upload-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "interaction.target.id", value: { stringValue: "upload-button" } },
            { key: "interaction.name", value: { stringValue: "Upload" } },
            { key: "interaction.name_source", value: { stringValue: "standard_attribute" } },
          ]),
          body: { stringValue: `Click "Upload" on ${PAGE_PATH}` },
        })
      );

      const requests = await getOTLPRequests();
      expect(JSON.stringify(requests)).not.toContain("LABELLEDBY-SECRET-8814");
    });

    expectNoBrowserErrors();
  });

  it("attributes a fetch fired from a click handler to the interaction that caused it", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const btn = await $("#fetch-button");
    await btn.click();

    await retry(async () => {
      // Both halves are positive assertions, so retry() cannot succeed before the
      // interaction event and its request span have both arrived.
      const interactionId = await getInteractionIdForTarget("fetch-button");

      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "user_interaction.id", value: { stringValue: interactionId } },
            { key: "user_interaction.name", value: { stringValue: "Load Report" } },
          ]),
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("attributes an XMLHttpRequest fired from a click handler to the interaction that caused it", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${PAGE_PATH}?testId=${testId}`);

    const btn = await $("#xhr-button");
    await btn.click();

    await retry(async () => {
      const interactionId = await getInteractionIdForTarget("xhr-button");

      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([
            { key: "url.path", value: { stringValue: "/ajax" } },
            { key: "user_interaction.id", value: { stringValue: interactionId } },
            { key: "user_interaction.name", value: { stringValue: "Refresh Table" } },
          ]),
        })
      );
    });

    expectNoBrowserErrors();
  });

  it("stamps no user_interaction attributes on request spans when interactionInstrumentation is disabled", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${DISABLED_PAGE_PATH}?testId=${testId}`);

    const btn = await $("#fetch-button");
    await btn.click();

    await retry(async () => {
      // Positive gate first: without waiting for the request span to actually
      // arrive, the absence check below would pass vacuously.
      await expectSpanMatching(
        expect.objectContaining({
          name: "HTTP GET",
          attributes: expect.arrayContaining([{ key: "url.path", value: { stringValue: "/ajax" } }]),
        })
      );

      const attributeKeys = (await getSpans()).flatMap((span: any) => (span.attributes ?? []).map((kv: any) => kv.key));
      expect(attributeKeys).not.toContain("user_interaction.id");
      expect(attributeKeys).not.toContain("user_interaction.name");
    });

    expectNoBrowserErrors();
  });

  it("emits no browser.interaction logs when interactionInstrumentation is left at its default (disabled)", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`${DISABLED_PAGE_PATH}?testId=${testId}`);

    const btn = await $("#save-button");
    await btn.click();
    const otherBtn = await $("#plain-button");
    await otherBtn.click();

    await retry(async () => {
      // Positive gates first. Each button's own onclick sends a marker event, which the
      // capture-phase interaction listener would have preceded within the same dispatch
      // task and hence the same log batch (see page-disabled.html). Once both markers have
      // arrived, a browser.interaction log would have arrived alongside them -- without
      // this the absence check below succeeds on retry()'s first probe and proves nothing.
      for (const marker of ["e2e.marker.save", "e2e.marker.plain"]) {
        await expectLogMatching(
          expect.objectContaining({
            attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: marker } }]),
          })
        );
      }

      await expectNoLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.interaction" } }]),
        })
      );
    });

    expectNoBrowserErrors();
  });
});
