import { getOTLPRequests, sharedAfterEach, sharedBeforeEach } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { loadPage, retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors, expectNoLogMatching } from "../expectations";

const PAGE_PATH = "/e2e/spec/10-interactions/page.html";

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
            // (INPUT targets never fall back to reading their own value or text
            // content -- see TEXT_FALLBACK_EXCLUDED_TAGS / VALUE_READABLE_INPUT_TYPES
            // in src/instrumentations/interactions/action-name.ts). The pre-filled
            // `value="pre-filled secret"` must never leak into the emitted log.
            { key: "interaction.name", value: { stringValue: "Type here" } },
            { key: "interaction.name_source", value: { stringValue: "standard_attribute" } },
          ]),
        })
      );

      const requests = await getOTLPRequests();
      const logRequests = requests.filter((r) => r.path === "/v1/logs");
      const logRecords = logRequests.flatMap((r) =>
        "resourceLogs" in r.body ? r.body.resourceLogs.flatMap((rl) => rl.scopeLogs.flatMap((sl) => sl.logRecords)) : []
      );
      const interactionRecord = logRecords.find((lr: any) =>
        lr.attributes?.some((kv: any) => kv.key === "interaction.target.id" && kv.value.stringValue === "text-input")
      ) as any;

      expect(interactionRecord.attributes.map((kv: any) => kv.value?.stringValue)).not.toContain("pre-filled secret");
      expect(interactionRecord.body?.stringValue).not.toContain("pre-filled secret");
    });

    expectNoBrowserErrors();
  });

  it("emits no browser.interaction logs when interactionInstrumentation is left at its default (disabled)", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`/e2e/spec/10-interactions/page-disabled.html?testId=${testId}`);

    const btn = await $("#save-button");
    await btn.click();
    const otherBtn = await $("#plain-button");
    await otherBtn.click();

    await retry(async () => {
      await expectNoLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.interaction" } }]),
        })
      );
    });

    expectNoBrowserErrors();
  });
});
