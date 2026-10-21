import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValue, LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { sendLog } from "../../transport";
import { startPageLoadInstrumentation } from "./page-load";
import { vars } from "../../vars";
import { doc } from "../../utils/globals";

describe("startPageLoadInstrumentation", () => {
  const originalScrubber = vars.urlAttributeScrubber;

  beforeEach(() => {
    (sendLog as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vars.urlAttributeScrubber = originalScrubber;
    vi.restoreAllMocks();
  });

  it("scrubs the navigation timing name with the url attribute scrubber", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.full": attrs["url.full"].split("?")[0]! });
    vi.spyOn(doc!, "readyState", "get").mockReturnValue("complete");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: "https://example.com/callback?code=secret" } as PerformanceEntry,
    ]);

    startPageLoadInstrumentation();

    const logs = (sendLog as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as LogRecord);
    const timing = logs.find((l) =>
      l.attributes.some((a) => a.key === "event.name" && a.value.stringValue === "browser.navigation_timing")
    );
    const bodyValues = timing?.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toContainEqual({ key: "name", value: { stringValue: "https://example.com/callback" } });
  });
});
