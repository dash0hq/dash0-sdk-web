import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValue, LogRecord } from "../types/otlp";

vi.mock("../transport", () => ({
  sendLog: vi.fn(),
}));

import { sendLog } from "../transport";
import { startView } from "./start-view";
import { vars } from "../vars";

const sendLogMock = sendLog as unknown as ReturnType<typeof vi.fn>;

describe("startView", () => {
  beforeEach(() => {
    sendLogMock.mockClear();
    vars.endpoints = [{ url: "https://example.com", authToken: "auth_abc123" }];
    vars.pageViewInstrumentation = { trackVirtualPageViews: true, includeParts: [] };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vars.endpoints = [];
  });

  it("accepts a string shorthand and uses it as the title", () => {
    startView("/settings");

    expect(sendLogMock).toHaveBeenCalledTimes(1);
    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(expect.arrayContaining([{ key: "title", value: { stringValue: "/settings" } }]));
  });

  it("accepts an options object with attributes", () => {
    startView("/settings", { attributes: { "app.screen": "settings" } });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    const bodyValues = log.body?.kvlistValue?.values as KeyValue[];
    expect(bodyValues).toEqual(expect.arrayContaining([{ key: "title", value: { stringValue: "/settings" } }]));
    expect(log.attributes).toEqual(expect.arrayContaining([{ key: "app.screen", value: { stringValue: "settings" } }]));
  });

  it("parses a relative url option and reflects it in page.url.path", () => {
    startView("/settings", { url: "/settings" });

    const log = sendLogMock.mock.calls[0]![0] as LogRecord;
    expect(log.attributes).toEqual(
      expect.arrayContaining([{ key: "page.url.path", value: { stringValue: "/settings" } }])
    );
  });

  it("falls back to no url override and logs a debug message on an invalid url", () => {
    startView("/settings", { url: "http://" });

    expect(sendLogMock).toHaveBeenCalledTimes(1);
  });

  it("does not touch history or location", () => {
    // eslint-disable-next-line no-restricted-globals
    const originalHref = window.location.href;
    // eslint-disable-next-line no-restricted-globals
    const originalLength = window.history.length;

    startView("/settings");

    // eslint-disable-next-line no-restricted-globals
    expect(window.location.href).toBe(originalHref);
    // eslint-disable-next-line no-restricted-globals
    expect(window.history.length).toBe(originalLength);
  });

  it("ignores calls without a name, as they can arrive via the untyped script entrypoint", () => {
    // @ts-expect-error deliberately calling without arguments, mirroring dash0("startView")
    startView();
    startView(undefined as unknown as string);
    startView(null as unknown as string);

    expect(sendLogMock).not.toHaveBeenCalled();
  });

  it("ignores calls with a non-string or empty name", () => {
    startView(123 as unknown as string);
    startView({ name: "/settings" } as unknown as string);
    startView("");

    expect(sendLogMock).not.toHaveBeenCalled();
  });

  it("tolerates a nullish options argument", () => {
    startView("/settings", null as unknown as undefined);

    expect(sendLogMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op before init (no endpoints configured)", () => {
    vars.endpoints = [];

    startView("/settings");

    expect(sendLogMock).not.toHaveBeenCalled();
  });
});
