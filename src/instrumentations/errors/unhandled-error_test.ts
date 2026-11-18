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

  it("does not report errors whose frames all come from browser extensions", () => {
    expect(
      reportedMessages([
        {
          message: "Cannot redefine property: create",
          stack:
            "TypeError: Cannot redefine property: create\n" +
            "    at Object.defineProperty (<anonymous>)\n" +
            "    at _0x518498 (chrome-extension://dbpnkcjkchadgbgihmmolkjcgjkodoaf/webauthnInterceptor.js:1:82615)",
        },
        {
          message: "firefox",
          stack: "fn@moz-extension://abc123/content.js:10:5\n@moz-extension://abc123/content.js:1:1",
        },
        { message: "safari", stack: "f@webkit-masked-url://hidden/:2:135479\nforEach@[native code]" },
        { message: "safari web extension", stack: "safari-web-extension://abc/content.js:1:1" },
        { message: "legacy edge, upper case", stack: "at MS-Browser-Extension://abc/content.js:1:1" },
        { message: "Uncaught TypeError: x", stack: "at chrome-extension://abc/inject.js 1:3159" },
      ])
    ).toEqual([]);
  });

  it("reports errors with any frame from the page, even when an extension wraps the browser API that threw", () => {
    expect(
      reportedMessages([
        {
          message: "Unhandled promise rejection: Failed to fetch",
          stack:
            "TypeError: Failed to fetch\n" +
            "    at o (chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant.js:2:17856)\n" +
            "    at window.fetch (chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant.js:2:17921)\n" +
            "    at load (https://app.example.com/chunk.js:1:52365)",
        },
        { message: "app in safari", stack: "f@webkit-masked-url://hidden/:2:1\nload@https://app.example.com/a.js:1:1" },
        { message: "no stack" },
      ])
    ).toEqual(["Unhandled promise rejection: Failed to fetch", "app in safari", "no stack"]);
  });

  it("does not take URLs in the error message for stack frames", () => {
    const wrapped = "Wrapped: TypeError: x\n    at f (chrome-extension://abc/content.js:1:1)";
    expect(
      reportedMessages([
        // Error.stackTraceLimit = 0 leaves only the message in a V8 stack.
        {
          message: "Unhandled promise rejection: Failed to load chrome-extension://abc/logo.png",
          stack: "Error: Failed to load chrome-extension://abc/logo.png",
        },
        { message: wrapped, stack: `Error: ${wrapped}\n    at Array.forEach (<anonymous>)` },
      ])
    ).toEqual(["Unhandled promise rejection: Failed to load chrome-extension://abc/logo.png", wrapped]);
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
