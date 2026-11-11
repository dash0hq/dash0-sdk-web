import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyValue, LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
  sendConsoleLog: vi.fn(),
}));

type FakeConsole = Record<"debug" | "log" | "info" | "warn" | "error" | "trace", ReturnType<typeof vi.fn>>;

function attr(log: LogRecord, key: string): unknown {
  const value = log.attributes?.find((a: KeyValue) => a.key === key)?.value;
  return value && Object.values(value)[0];
}

describe("console instrumentation", () => {
  // Fresh modules and a fresh console per test: `wrap()` marks the functions it wraps, so a wrapped console can
  // not be instrumented again.
  let startConsoleInstrumentation: typeof import("./index").startConsoleInstrumentation;
  let sendConsoleLog: ReturnType<typeof vi.fn>;
  let vars: typeof import("../../vars").vars;
  let fake: FakeConsole;
  let originals: FakeConsole;

  beforeEach(async () => {
    vi.resetModules();
    fake = {
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    };
    originals = { ...fake };
    vi.stubGlobal("console", fake);

    startConsoleInstrumentation = (await import("./index")).startConsoleInstrumentation;
    sendConsoleLog = (await import("../../transport")).sendConsoleLog as unknown as ReturnType<typeof vi.fn>;
    sendConsoleLog.mockClear();
    vars = (await import("../../vars")).vars;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  });

  function sentLogs(): LogRecord[] {
    return sendConsoleLog.mock.calls.map((call) => call[0] as LogRecord);
  }

  it("captures warn and error by default and leaves the other methods alone", () => {
    startConsoleInstrumentation();

    console.log("not captured");
    console.warn("careful", 1);
    console.error("broken");

    expect(console.log).toBe(originals.log);
    expect(sentLogs().map((l) => l.body)).toEqual([{ stringValue: "careful 1" }, { stringValue: "broken" }]);
  });

  it("calls the original method with the original arguments and this", () => {
    startConsoleInstrumentation();
    const payload = { a: 1 };

    console.warn("message", payload);

    expect(originals.warn).toHaveBeenCalledWith("message", payload);
    expect(originals.warn.mock.contexts[0]).toBe(fake);
  });

  it("sends a browser.console event with severity and method", () => {
    vars.consoleLogs.levels = ["debug", "log", "info", "warn", "error"];
    startConsoleInstrumentation();

    console.debug("d");
    console.log("l");
    console.info("i");
    console.warn("w");
    console.error("e");

    expect(sentLogs().map((l) => [l.severityText, l.severityNumber, attr(l, "browser.console.method")])).toEqual([
      ["DEBUG", 5, "debug"],
      ["INFO", 9, "log"],
      ["INFO", 9, "info"],
      ["WARN", 13, "warn"],
      ["ERROR", 17, "error"],
    ]);
    for (const log of sentLogs()) {
      expect(attr(log, "event.name")).toBe("browser.console");
      expect(attr(log, "page.url.full")).toBe(location.href);
      expect(log.timeUnixNano).toEqual(expect.any(String));
    }
  });

  it("does not capture messages the SDK logs itself", async () => {
    const { warn, error } = await import("../../utils");
    startConsoleInstrumentation();

    warn("Dash0 SDK warning");
    error("Failed to transmit logs");

    expect(originals.warn).toHaveBeenCalledWith("Dash0 SDK warning");
    expect(originals.error).toHaveBeenCalledWith("Failed to transmit logs");
    expect(sendConsoleLog).not.toHaveBeenCalled();
  });

  it("does not capture messages logged while formatting a captured message", () => {
    startConsoleInstrumentation();
    const noisy = {
      get value() {
        console.error("logged by a getter");
        return 1;
      },
    };

    console.warn(noisy);

    expect(sentLogs().map((l) => l.body)).toEqual([{ stringValue: '{"value":1}' }]);
    expect(originals.error).toHaveBeenCalledWith("logged by a getter");
  });

  it("adds exception attributes for an error argument", () => {
    startConsoleInstrumentation();
    const err = new TypeError("bad input");

    console.error("Request failed:", err);

    const log = sentLogs()[0]!;
    expect(log.body).toEqual({ stringValue: "Request failed: TypeError: bad input" });
    expect(attr(log, "exception.type")).toBe("TypeError");
    expect(attr(log, "exception.message")).toBe("bad input");
    expect(attr(log, "exception.stacktrace")).toContain("bad input");
  });

  it("adds the caller's stack trace to console.trace, without the wrapper frame", () => {
    vars.consoleLogs.levels = ["trace"];
    startConsoleInstrumentation();

    (function callerOfTrace() {
      console.trace("here");
    })();

    const stack = attr(sentLogs()[0]!, "code.stacktrace") as string;
    expect(stack.split("\n")[0]).toContain("callerOfTrace");
  });

  it("drops ignored messages", () => {
    vars.consoleLogs.ignoreMessages = [/ResizeObserver loop/];
    startConsoleInstrumentation();

    console.error("ResizeObserver loop completed with undelivered notifications.");
    console.error("kept");

    expect(sentLogs().map((l) => l.body)).toEqual([{ stringValue: "kept" }]);
  });

  it("truncates long messages", () => {
    vars.consoleLogs.maxMessageLength = 5;
    startConsoleInstrumentation();

    console.warn("0123456789");

    expect(sentLogs()[0]!.body).toEqual({ stringValue: "01234…" });
  });

  it("scrubs the page url in messages", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.full": attrs["url.full"].split("?")[0]! });
    history.replaceState(null, "", "/callback?code=secret");
    const href = location.href;
    startConsoleInstrumentation();

    console.error(`could not load ${href}`);

    expect(sentLogs()[0]!.body).toEqual({ stringValue: `could not load ${href.split("?")[0]}` });
  });

  it("sends nothing from an ignored page or an unsampled session", () => {
    startConsoleInstrumentation();

    vars.ignoreUrls = [/\/private/];
    history.replaceState(null, "", "/private");
    console.error("ignored page");

    vars.ignoreUrls = [];
    vars.isSessionSampled = false;
    console.error("unsampled");

    expect(sendConsoleLog).not.toHaveBeenCalled();
    expect(originals.error).toHaveBeenCalledTimes(2);
  });

  it("stops sending once the rate limit is reached, but keeps logging", () => {
    startConsoleInstrumentation();

    for (let i = 0; i < 60; i++) {
      console.error(`message ${i}`);
    }

    expect(sendConsoleLog).toHaveBeenCalledTimes(50);
    expect(originals.error).toHaveBeenCalledTimes(60);
  });

  it("ignores calls without arguments", () => {
    startConsoleInstrumentation();

    console.error();

    expect(sendConsoleLog).not.toHaveBeenCalled();
    expect(originals.error).toHaveBeenCalledTimes(1);
  });

  it("instruments only once", () => {
    startConsoleInstrumentation();
    startConsoleInstrumentation();

    console.error("once");

    expect(sendConsoleLog).toHaveBeenCalledTimes(1);
  });
});
