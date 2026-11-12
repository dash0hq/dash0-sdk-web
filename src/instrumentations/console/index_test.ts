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
    const noisy = new Proxy(
      { value: 1 },
      {
        ownKeys(target) {
          console.error("logged by a proxy trap");
          return Reflect.ownKeys(target);
        },
      }
    );

    console.warn(noisy);

    expect(sentLogs().map((l) => l.body)).toEqual([{ stringValue: '{"value":1}' }]);
    expect(originals.error).toHaveBeenCalledWith("logged by a proxy trap");
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

  it("captures console.trace without arguments", () => {
    vars.consoleLogs.levels = ["trace"];
    startConsoleInstrumentation();

    (function callerOfTrace() {
      console.trace();
    })();

    const log = sentLogs()[0]!;
    expect(log.body).toEqual({ stringValue: "console.trace" });
    expect((attr(log, "code.stacktrace") as string).split("\n")[0]).toContain("callerOfTrace");
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

  describe("scrubs page urls before cutting the message", () => {
    let href: string;
    let scrubbedHref: string;

    beforeEach(() => {
      vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.full": attrs["url.full"].split("?")[0]! });
      history.replaceState(null, "", "/callback?code=secret");
      href = location.href;
      scrubbedHref = href.split("?")[0]!;
      startConsoleInstrumentation();
    });

    it("when the cut falls inside the url", () => {
      const prefix = "x".repeat(10) + " ";
      vars.consoleLogs.maxMessageLength = prefix.length + href.length - 3;

      console.error(prefix + href + " " + "y".repeat(100));

      expect(sentLogs()[0]!.body).toEqual({ stringValue: prefix + scrubbedHref + "…" });
    });

    it("when the cut falls right after the url", () => {
      vars.consoleLogs.maxMessageLength = href.length;

      console.error(href + " and more");

      // Scrubbing makes the message fit.
      expect(sentLogs()[0]!.body).toEqual({ stringValue: scrubbedHref + " and more" });
    });

    it("when the message is cut while it is formatted", () => {
      vars.consoleLogs.maxMessageLength = href.length;

      console.error(href + " " + "y".repeat(10000));

      expect(sentLogs()[0]!.body).toEqual({ stringValue: scrubbedHref + "…" });
    });

    it("when a second url is cut while the message is formatted", () => {
      // Scrubbing the leading urls shortens the message by more than the length of the url that is cut.
      const leading = 4;
      const filler = "x".repeat(20);
      vars.consoleLogs.maxMessageLength = (href + " ").repeat(leading).length + filler.length;

      console.error((href + " ").repeat(leading) + filler + " " + href + " and more");

      const body = (sentLogs()[0]!.body as { stringValue: string }).stringValue;
      expect(body).toBe((scrubbedHref + " ").repeat(leading) + filler + "…");
      expect(body).not.toContain("code=");
    });
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

  it("does not count ignored messages against the rate limit", () => {
    vars.consoleLogs.ignoreMessages = [/ResizeObserver loop/];
    startConsoleInstrumentation();

    for (let i = 0; i < 100; i++) {
      console.error("ResizeObserver loop completed with undelivered notifications.");
    }
    console.error("kept");

    expect(sentLogs().map((l) => l.body)).toEqual([{ stringValue: "kept" }]);
  });

  it("stops formatting once the formatting cap is reached", () => {
    vars.consoleLogs.ignoreMessages = [/ignored/];
    startConsoleInstrumentation();
    let formatted = 0;
    const counting = new Proxy(
      {},
      {
        ownKeys(target) {
          formatted++;
          return Reflect.ownKeys(target);
        },
      }
    );

    for (let i = 0; i < 250; i++) {
      console.error("ignored", counting);
    }

    expect(formatted).toBe(200);
    expect(sendConsoleLog).not.toHaveBeenCalled();
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
