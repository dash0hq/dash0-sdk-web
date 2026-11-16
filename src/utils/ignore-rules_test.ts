import { afterEach, describe, expect, it } from "vitest";
import { vars } from "../vars";
import { isErrorIgnored, isUrlIgnored, matchesAny, normalizePatterns } from "./ignore-rules";

describe("matchesAny", () => {
  it("matches a string anywhere in the value", () => {
    expect(matchesAny(["/callback"], "https://example.com/auth/callback?code=1")).toBe(true);
    expect(matchesAny(["example.com/auth"], "https://example.com/auth/callback")).toBe(true);
  });

  it("matches a string case-sensitively", () => {
    expect(matchesAny(["/callback"], "https://example.com/Callback")).toBe(false);
  });

  it("takes a string literally, not as a regular expression", () => {
    expect(matchesAny([".example.com"], "https://www.example.com/")).toBe(true);
    expect(matchesAny([".example.com"], "https://wwwxexample.com/")).toBe(false);
    expect(matchesAny(["a+b"], "aab")).toBe(false);
    expect(matchesAny(["a+b"], "?q=a+b")).toBe(true);
  });

  it("matches a regular expression as RegExp.test does", () => {
    expect(matchesAny([/^https:\/\/example\.com\//], "https://example.com/a")).toBe(true);
    expect(matchesAny([/^https:\/\/example\.com\//], "https://other.com/https://example.com/")).toBe(false);
    expect(matchesAny([/CALLBACK/i], "https://example.com/callback")).toBe(true);
  });

  it("matches when any of mixed strings and regular expressions matches", () => {
    const patterns = ["/never", /\/callback$/, "?code="];
    expect(matchesAny(patterns, "https://example.com/callback")).toBe(true);
    expect(matchesAny(patterns, "https://example.com/?code=1")).toBe(true);
    expect(matchesAny(patterns, "https://example.com/home")).toBe(false);
  });

  it("does not match with no patterns", () => {
    expect(matchesAny([], "https://example.com/")).toBe(false);
  });
});

describe("isUrlIgnored", () => {
  afterEach(() => {
    vars.ignoreUrls = [];
  });

  it("ignores urls that contain a string pattern", () => {
    vars.ignoreUrls = ["/ingest/"];
    expect(isUrlIgnored("https://example.com/ingest/e/")).toBe(true);
    expect(isUrlIgnored("https://example.com/api/users")).toBe(false);
  });
});

describe("isErrorIgnored", () => {
  afterEach(() => {
    vars.ignoreErrorMessages = [];
  });

  it("ignores messages that contain a string pattern", () => {
    vars.ignoreErrorMessages = ["ResizeObserver loop"];
    expect(isErrorIgnored("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isErrorIgnored("TypeError: x is undefined")).toBe(false);
  });

  it("ignores messages that match a regular expression pattern", () => {
    vars.ignoreErrorMessages = [/^network request failed$/i];
    expect(isErrorIgnored("Network request failed")).toBe(true);
    expect(isErrorIgnored("Network request failed: timeout")).toBe(false);
  });
});

describe("normalizePatterns", () => {
  it("trims strings", () => {
    expect(normalizePatterns([" /callback ", "\t?code=\n"], "ignoreUrls")).toEqual(["/callback", "?code="]);
  });

  it("drops strings that are empty after trimming", () => {
    expect(normalizePatterns(["", "  ", "/callback"], "ignoreUrls")).toEqual(["/callback"]);
  });

  it("keeps regular expressions, including ones that match whitespace", () => {
    const patterns = [/ /, /^\s*$/];
    expect(normalizePatterns(patterns, "ignoreUrls")).toEqual(patterns);
    expect(normalizePatterns(patterns, "ignoreUrls")[0]).toBe(patterns[0]);
  });

  it("uses a single string or regular expression as a one-item array", () => {
    expect(normalizePatterns(" /health " as unknown as string[], "ignoreUrls")).toEqual(["/health"]);
    expect(normalizePatterns(/\/health/ as unknown as RegExp[], "ignoreUrls")).toEqual([/\/health/]);
    expect(normalizePatterns("  " as unknown as string[], "ignoreUrls")).toEqual([]);
  });

  it("keeps values that are neither strings nor regular expressions, and non-array configurations", () => {
    const junk = {} as unknown as RegExp;
    expect(normalizePatterns([junk], "ignoreUrls")).toEqual([junk]);
    expect(normalizePatterns(null as unknown as RegExp[], "ignoreUrls")).toBeNull();
  });
});
