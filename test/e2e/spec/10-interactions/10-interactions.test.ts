import { sharedAfterEach, sharedBeforeEach } from "../shared";
import { browser } from "@wdio/globals";
import { loadPage, retry } from "../utils";
import { expectLogMatching, expectNoLogMatching } from "../expectations";

describe("Interaction Instrumentation", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("emits a browser.interaction log with the custom action name when a data-dash0-action-name button is clicked", async () => {
    await loadPage("/e2e/spec/10-interactions/page.html");
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
          ]),
          body: {
            kvlistValue: {
              values: expect.arrayContaining([
                { key: "type", value: { stringValue: "click" } },
                { key: "name", value: { stringValue: "Save Settings" } },
                { key: "name_source", value: { stringValue: "custom_attribute" } },
                { key: "target.tag", value: { stringValue: "button" } },
                { key: "target.id", value: { stringValue: "save-button" } },
                { key: "target.selector", value: { stringValue: "button#save-button" } },
              ]),
            },
          },
          severityNumber: 9,
          severityText: "INFO",
          timeUnixNano: expect.any(String),
        })
      );
    });
  });

  it("derives the name from visible text when no custom attribute or aria-label is present", async () => {
    await loadPage("/e2e/spec/10-interactions/page.html");

    const btn = await $("#plain-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          body: {
            kvlistValue: {
              values: expect.arrayContaining([
                { key: "name", value: { stringValue: "Continue" } },
                { key: "name_source", value: { stringValue: "text_content" } },
                { key: "target.id", value: { stringValue: "plain-button" } },
                { key: "target.selector", value: { stringValue: "button#plain-button" } },
              ]),
            },
          },
        })
      );
    });
  });

  it("derives the name from aria-label for an icon-only button with no visible text", async () => {
    await loadPage("/e2e/spec/10-interactions/page.html");

    const btn = await $("#icon-button");
    await btn.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          body: {
            kvlistValue: {
              values: expect.arrayContaining([
                { key: "name", value: { stringValue: "Close Dialog" } },
                { key: "name_source", value: { stringValue: "standard_attribute" } },
                { key: "target.id", value: { stringValue: "icon-button" } },
                { key: "target.selector", value: { stringValue: "button#icon-button" } },
              ]),
            },
          },
        })
      );
    });
  });

  it("never derives a name from a text input's value, even though it has a pre-filled value", async () => {
    await loadPage("/e2e/spec/10-interactions/page.html");

    const input = await $("#text-input");
    await input.click();

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          body: {
            kvlistValue: {
              values: expect.arrayContaining([
                { key: "target.id", value: { stringValue: "text-input" } },
                { key: "target.tag", value: { stringValue: "input" } },
                // The input's only available name source is its `placeholder` attribute
                // (INPUT targets never fall back to reading their own value or text
                // content -- see TEXT_FALLBACK_EXCLUDED_TAGS / VALUE_READABLE_INPUT_TYPES
                // in src/instrumentations/interactions/action-name.ts). The pre-filled
                // `value="pre-filled secret"` must never leak into the emitted log.
                { key: "name", value: { stringValue: "Type here" } },
                { key: "name_source", value: { stringValue: "standard_attribute" } },
              ]),
            },
          },
        })
      );

      const requests = await (await import("../shared")).getOTLPRequests();
      const logRequests = requests.filter((r) => r.path === "/v1/logs");
      const bodies = logRequests.flatMap((r) =>
        "resourceLogs" in r.body
          ? r.body.resourceLogs.flatMap((rl) => rl.scopeLogs.flatMap((sl) => sl.logRecords.map((lr) => lr.body)))
          : []
      );
      const interactionBody = bodies.find((b: any) =>
        b?.kvlistValue?.values?.some((kv: any) => kv.key === "target.id" && kv.value.stringValue === "text-input")
      ) as any;

      expect(interactionBody.kvlistValue.values.map((kv: any) => kv.value?.stringValue)).not.toContain(
        "pre-filled secret"
      );
      expect(interactionBody.kvlistValue.values.find((kv: any) => kv.key === "name")?.value.stringValue).not.toBe(
        "pre-filled secret"
      );
    });
  });

  it("emits no browser.interaction logs when interactionInstrumentation is left at its default (disabled)", async () => {
    await loadPage("/e2e/spec/10-interactions/page-disabled.html");

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
  });
});
