import { describe, it, expect, vi, beforeEach } from "vitest";
import { addCommonAttributes } from "./common";
import { KeyValue } from "../../types/otlp";
import * as utils from "../utils";
import * as varsModule from "../vars";
import * as urlModule from "./url";
import * as sessionApi from "../api/session";
import * as tabIdModule from "../utils/tab-id";

describe("addCommonAttributes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(utils, "generateUniqueId").mockReturnValue("unique-id");
    vi.spyOn(urlModule, "addUrlAttributes").mockImplementation((attrs) => {
      attrs.push({ key: "url", value: { stringValue: "http://test" } });
    });
    vi.spyOn(utils, "win", "get").mockReturnValue({
      innerWidth: 800,
      innerHeight: 600,
      location: { href: "http://test" },
    } as any);
    vi.spyOn(utils, "nav", "get").mockReturnValue({ connection: { effectiveType: "4g" } } as any);
    vi.spyOn(varsModule.vars, "signalAttributes", "get").mockReturnValue([
      { key: "foo", value: { stringValue: "bar" } },
    ]);
    vi.spyOn(sessionApi, "sessionId", "get").mockReturnValue("session-123");
    vi.spyOn(tabIdModule, "tabId", "get").mockReturnValue("tab-456");
  });

  it("adds all expected attributes", () => {
    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);

    expect(attributes).toEqual(
      expect.arrayContaining([
        { key: "dash0.web.event.id", value: { stringValue: "unique-id" } },
        { key: "foo", value: { stringValue: "bar" } },
        { key: "url", value: { stringValue: "http://test" } },
        { key: "session.id", value: { stringValue: "session-123" } },
        { key: "browser.tab.id", value: { stringValue: "tab-456" } },
        { key: "browser.window.width", value: { doubleValue: 800 } },
        { key: "browser.window.height", value: { doubleValue: 600 } },
        { key: "network.connection.subtype", value: { stringValue: "4g" } },
      ])
    );
  });

  it("does not overwrite web.event_id if already present", () => {
    const attributes: KeyValue[] = [{ key: "web.event_id", value: { stringValue: "existing" } }];
    addCommonAttributes(attributes);

    const eventId = attributes.find((a) => a.key === "web.event_id");
    expect(eventId?.value?.stringValue).toBe("existing");
  });

  it("should not set the session ID if sessionId is not available", () => {
    vi.spyOn(sessionApi, "sessionId", "get").mockReturnValue("");
    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);

    expect(attributes).not.toEqual(expect.arrayContaining([{ key: "session.id" }]));
  });

  it("should not set the tab ID if tabId is not available", () => {
    vi.spyOn(tabIdModule, "tabId", "get").mockReturnValue("");
    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);

    expect(attributes).not.toEqual(expect.arrayContaining([{ key: "browser.tab.id" }]));
  });

  it("should set the fallback value when window size properties are not available", () => {
    vi.spyOn(utils, "win", "get").mockReturnValue(undefined);
    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);

    expect(attributes).toEqual(
      expect.arrayContaining([
        { key: "browser.window.width", value: { stringValue: "undefined" } },
        { key: "browser.window.height", value: { stringValue: "undefined" } },
      ])
    );
  });

  it("should not set the network connection type if not available", () => {
    vi.spyOn(utils, "nav", "get").mockReturnValue({} as any);
    const attributes: KeyValue[] = [];
    addCommonAttributes(attributes);

    expect(attributes).not.toEqual(expect.arrayContaining([{ key: "network.connection.subtype" }]));
  });
});
