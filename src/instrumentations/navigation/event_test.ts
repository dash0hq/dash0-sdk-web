import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValue, LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

import { sendLog } from "../../transport";
import { transmitPageViewEvent, transmitManualPageViewEvent } from "./event";
import { vars } from "../../vars";

const sendLogMock = sendLog as unknown as ReturnType<typeof vi.fn>;

describe("transmitPageViewEvent", () => {
  beforeEach(() => {
    sendLogMock.mockClear();
    vars.pageViewInstrumentation = { trackVirtualPageViews: true, includeParts: [] };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("transmits an initial page view with type=INITIAL and change_state=pushState", () => {
    transmitPageViewEvent("1700000000000000000", new URL("https://example.com/landing"));

    expect(sendLogMock).toHaveBeenCalledTimes(1);
    const log = sendLogMock.mock.calls[0]![0] as LogRecord;

    expect(log.timeUnixNano).toBe("1700000000000000000");
    expect(log.severityNumber).toBe(9);
    expect(log.severityText).toBe("INFO");
    expect(log.attributes).toEqual(
      expect.arrayContaining([{ key: "event.name", value: { stringValue: "browser.page_view" } }])
    );

    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(
      expect.arrayContaining([
        { key: "type", value: { doubleValue: 0 } },
        { key: "change_state", value: { stringValue: "pushState" } },
      ])
    );
  });

  it("transmits a virtual page view with type=VIRTUAL and change_state=replaceState when replaced", () => {
    transmitPageViewEvent("1700000000000000000", new URL("https://example.com/settings"), true, true);

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(
      expect.arrayContaining([
        { key: "type", value: { doubleValue: 1 } },
        { key: "change_state", value: { stringValue: "replaceState" } },
      ])
    );
  });

  it("applies generateMetadata title and attributes when provided", () => {
    vars.pageViewInstrumentation = {
      trackVirtualPageViews: true,
      includeParts: [],
      generateMetadata: () => ({ title: "Custom Title", attributes: { "app.screen": "settings" } }),
    };

    transmitPageViewEvent("1700000000000000000", new URL("https://example.com/settings"), true);

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    expect(log.attributes).toEqual(expect.arrayContaining([{ key: "app.screen", value: { stringValue: "settings" } }]));
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(expect.arrayContaining([{ key: "title", value: { stringValue: "Custom Title" } }]));
  });
});

describe("transmitManualPageViewEvent", () => {
  beforeEach(() => {
    sendLogMock.mockClear();
    vars.pageViewInstrumentation = {
      trackVirtualPageViews: true,
      includeParts: [],
      generateMetadata: () => ({ title: "should not be used", attributes: { should_not_appear: true } }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vars.pageViewInstrumentation = { trackVirtualPageViews: true, includeParts: [] };
  });

  it("emits type=VIRTUAL and no change_state key", () => {
    transmitManualPageViewEvent({ timeUnixNano: "1700000000000000000", title: "/settings" });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];

    expect(bodyValues).toEqual(
      expect.arrayContaining([
        { key: "type", value: { doubleValue: 1 } },
        { key: "title", value: { stringValue: "/settings" } },
      ])
    );
    expect(bodyValues.find((v) => v.key === "change_state")).toBeUndefined();
  });

  it("does not invoke vars.pageViewInstrumentation.generateMetadata", () => {
    const generateMetadata = vi.fn().mockReturnValue({ title: "ignored" });
    vars.pageViewInstrumentation = { trackVirtualPageViews: true, includeParts: [], generateMetadata };

    transmitManualPageViewEvent({ timeUnixNano: "1700000000000000000", title: "/settings" });

    expect(generateMetadata).not.toHaveBeenCalled();
    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(expect.arrayContaining([{ key: "title", value: { stringValue: "/settings" } }]));
  });

  it("merges custom attributes into signal attributes", () => {
    transmitManualPageViewEvent({
      timeUnixNano: "1700000000000000000",
      title: "/settings",
      attributes: { "app.screen": "settings", "app.tab_index": 2 },
    });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    expect(log.attributes).toEqual(
      expect.arrayContaining([
        { key: "app.screen", value: { stringValue: "settings" } },
        { key: "app.tab_index", value: { doubleValue: 2 } },
      ])
    );
  });

  it("adds custom attributes after SDK-generated ones so they can override", () => {
    transmitManualPageViewEvent({
      timeUnixNano: "1700000000000000000",
      title: "/settings",
      url: new URL("https://example.com/real-path"),
      attributes: { "page.url.path": "/custom-path" },
    });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const pathAttributes = (log.attributes as KeyValue[]).filter((attr) => attr.key === "page.url.path");
    expect(pathAttributes.length).toBeGreaterThan(1);
    expect(pathAttributes[pathAttributes.length - 1]).toEqual({
      key: "page.url.path",
      value: { stringValue: "/custom-path" },
    });
  });

  it("passes url through to page.url.* attributes when provided", () => {
    transmitManualPageViewEvent({
      timeUnixNano: "1700000000000000000",
      title: "/settings",
      url: new URL("https://example.com/settings"),
    });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    expect(log.attributes).toEqual(
      expect.arrayContaining([{ key: "page.url.path", value: { stringValue: "/settings" } }])
    );
  });

  it("includes referrer the same way the auto path does", () => {
    transmitManualPageViewEvent({ timeUnixNano: "1700000000000000000", title: "/settings" });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    // doc.referrer is empty string in jsdom by default, so "referrer" key should be absent
    expect(bodyValues.find((v) => v.key === "referrer")).toBeUndefined();
  });
});
