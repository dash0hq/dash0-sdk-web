import { afterEach, describe, expect, it, vi } from "vitest";
import { readDebugIds } from "./debug-ids";

describe("readDebugIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the script url in each stack key to its debug ID, the native global winning over Sentry's", () => {
    vi.stubGlobal("_sentryDebugIds", {
      "Error\n    at https://example.com/_next/static/chunks/app-1a2b.js:1:42": "sentry-app",
      "Error\n    at https://example.com/vendor.js:3:9": "sentry-vendor",
    });
    vi.stubGlobal("_debugIds", {
      "Error\n    at https://example.com/_next/static/chunks/app-1a2b.js:1:42": "native-app",
      "Error\n    at <anonymous>": "no-url",
    });

    expect(Object.fromEntries(readDebugIds())).toEqual({
      "https://example.com/_next/static/chunks/app-1a2b.js": "native-app",
      "https://example.com/vendor.js": "sentry-vendor",
    });
  });
});
