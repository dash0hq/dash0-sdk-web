import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogRecord } from "../../types/otlp";

vi.mock("../../transport", () => ({
  sendLog: vi.fn(),
}));

describe("reportUnhandledError", () => {
  // Fresh modules per test, so the tracked errors, the transmission timer and `vars` never leak between tests.
  let reportUnhandledError: typeof import("./unhandled-error").reportUnhandledError;
  let sendLog: ReturnType<typeof vi.fn>;
  let vars: typeof import("../../vars").vars;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    reportUnhandledError = (await import("./unhandled-error")).reportUnhandledError;
    sendLog = (await import("../../transport")).sendLog as unknown as ReturnType<typeof vi.fn>;
    sendLog.mockClear();
    vars = (await import("../../vars")).vars;
  });

  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.useRealTimers();
  });

  it("scrubs the page url in message, stack and component stack", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.full": attrs["url.full"].split("?")[0]! });
    history.replaceState(null, "", "/callback?code=secret");
    const href = location.href;

    reportUnhandledError(
      {
        name: "Error",
        message: `failed on ${href}`,
        stack: `Error: failed\n    at ${href}:12:5\n    at https://cdn.example.com/app.js?v=1:1:1`,
      },
      { componentStack: `\n    at Login (${href}:20:3)` }
    );
    vi.advanceTimersByTime(1000);

    const log = sendLog.mock.calls[0]![0] as LogRecord;
    const attr = (key: string) => log.attributes.find((a) => a.key === key)?.value.stringValue;
    const scrubbed = href.split("?")[0];
    expect(attr("exception.message")).toBe(`failed on ${scrubbed}`);
    expect(attr("exception.stacktrace")).toContain(`at ${scrubbed}:12:5`);
    // Unrelated urls are left untouched.
    expect(attr("exception.stacktrace")).toContain("https://cdn.example.com/app.js?v=1:1:1");
    expect(attr("exception.component_stack")).toBe(`\n    at Login (${scrubbed}:20:3)`);
  });

  it("does not report errors while the page url matches ignoreUrls", () => {
    vars.ignoreUrls = [/\/callback/];
    history.replaceState(null, "", "/callback");

    reportUnhandledError("boom");
    vi.advanceTimersByTime(1000);

    expect(sendLog).not.toHaveBeenCalled();
  });

  function reportedMessages(errors: Array<{ message: string; stack?: string }>): Array<string | undefined> {
    for (const error of errors) {
      reportUnhandledError({ name: "Error", ...error });
    }
    vi.advanceTimersByTime(1000);
    return sendLog.mock.calls.map((call) => (call[0] as LogRecord).body?.stringValue);
  }

  it("does not report the detail-less cross-origin 'Script error.'", () => {
    expect(
      reportedMessages([
        { message: "Script error.", stack: "at  0:0" },
        { message: "Script error" },
        { message: "Javascript error: Script error. on line 0" },
        { message: "Unhandled promise rejection: Script error." },
        { message: "Script error. while saving" },
      ])
    ).toEqual(["Unhandled promise rejection: Script error.", "Script error. while saving"]);
  });

  it("reports 'Script error.' when ignoreCrossOriginScriptErrors is off", () => {
    vars.ignoreCrossOriginScriptErrors = false;
    expect(reportedMessages([{ message: "Script error.", stack: "at  0:0" }])).toEqual(["Script error."]);
  });

  it("does not report errors thrown in a browser extension", () => {
    expect(
      reportedMessages([
        {
          message: "chrome",
          stack:
            "TypeError: Failed to fetch https://app.example.com/api\n" +
            "    at Object.defineProperty (<anonymous>)\n" +
            "    at o (chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant.js:2:14445)\n" +
            "    at https://app.example.com/chunk.js:1:52365",
        },
        { message: "firefox", stack: "fn@moz-extension://abc123/content.js:10:5\n@https://app.example.com/a.js:1:1" },
        { message: "safari", stack: "f@webkit-masked-url://hidden/:2:135479\nforEach@[native code]" },
        { message: "safari web extension", stack: "safari-web-extension://abc/content.js:1:1" },
        { message: "no error object", stack: "at chrome-extension://abc/inject.js 1:3159" },
      ])
    ).toEqual([]);
  });

  it("reports errors thrown in the page, even when an extension frame sits further down the stack", () => {
    expect(
      reportedMessages([
        {
          message: "app over extension",
          stack:
            "TypeError: Failed to load chrome-extension://abc/logo.png\n" +
            "    at load (https://app.example.com/chunk.js:1:100)\n" +
            "    at chrome-extension://abc/script.js:1:1",
        },
        { message: "app in safari", stack: "load@https://app.example.com/a.js:1:1\nf@webkit-masked-url://hidden/:2:1" },
        { message: "no stack" },
      ])
    ).toEqual(["app over extension", "app in safari", "no stack"]);
  });

  it("reports errors thrown in a browser extension when ignoreBrowserExtensionErrors is off", () => {
    vars.ignoreBrowserExtensionErrors = false;
    expect(reportedMessages([{ message: "firefox", stack: "fn@moz-extension://abc123/content.js:10:5" }])).toEqual([
      "firefox",
    ]);
  });

  it("drains buffered errors into the log batcher when the page is unloaded", () => {
    reportUnhandledError(new Error("boom"));
    expect(sendLog).not.toHaveBeenCalled();

    globalThis.dispatchEvent(new Event("beforeunload"));

    expect(sendLog).toHaveBeenCalledTimes(1);
    expect((sendLog.mock.calls[0]![0] as LogRecord).body).toEqual({ stringValue: "boom" });
  });
});
