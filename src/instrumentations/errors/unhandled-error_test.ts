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
});
