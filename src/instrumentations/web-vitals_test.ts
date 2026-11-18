import { afterEach, describe, expect, it, vi } from "vitest";
import { Metric } from "web-vitals";

vi.mock("../transport", () => ({
  sendLog: vi.fn(),
}));

vi.mock("web-vitals", () => ({
  onLCP: vi.fn(),
  onINP: vi.fn(),
  onCLS: vi.fn(),
}));

import { onLCP } from "web-vitals";
import { sendLog } from "../transport";
import { startWebVitalsInstrumentation } from "./web-vitals";
import { vars } from "../vars";

describe("startWebVitalsInstrumentation", () => {
  afterEach(() => {
    vars.ignoreUrls = [];
    vi.clearAllMocks();
  });

  function reportLcp() {
    startWebVitalsInstrumentation();
    const onWebVital = (onLCP as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    onWebVital({ name: "LCP", value: 1200, delta: 1200 } as Metric);
  }

  it("transmits web vitals", () => {
    reportLcp();

    expect(sendLog).toHaveBeenCalledTimes(1);
  });

  it("does not transmit web vitals while the page url matches ignoreUrls", () => {
    vars.ignoreUrls = [new RegExp(`^${location.origin}/`)];

    reportLcp();

    expect(sendLog).not.toHaveBeenCalled();
  });
});
