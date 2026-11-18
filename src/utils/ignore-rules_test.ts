import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("normalizePatterns with regular expressions", () => {
  it.each([
    [/.*\/ingest\/.*/i, /\/ingest\/.*/i],
    [/.*?\/callback/, /\/callback/],
    [/.*.*\/callback/, /\/callback/],
    [/\S*token=/, /token=/],
    [/[^?]*\/callback/, /\/callback/],
    [/[\s\S]*secret/s, /secret/s],
    [/[^]*secret/, /secret/],
    [/\.*x/, /x/],
    [/[\]a]*x/, /x/],
    [/.*/, /(?:)/],
    [/.*a|b/g, /a|b/g],
  ])("rewrites %s to %s", (pattern, expected) => {
    expect(normalizePatterns([pattern], "ignoreUrls")).toEqual([expected]);
  });

  it.each([
    /^.*\/callback/,
    /.+\/callback/,
    /(.*)\/callback\1/,
    /(?:ab)*c/,
    /\1*a(b)/,
    /\p{L}*a/u,
    /[a-z]*a/v,
    /.*a/y,
    /a.*/,
    /\/callback/,
  ])("keeps %s", (pattern) => {
    expect(normalizePatterns([pattern], "ignoreUrls")[0]).toBe(pattern);
  });

  it("gives the same test results as the original patterns", () => {
    const patterns = [
      /.*\/ingest\/.*/i,
      /.*\.google\.com.*/i,
      /.*?a.b/,
      /\S*token=/,
      /[^?]*\?code=/,
      /.*^a/m,
      /.*\bfoo/,
      /.*(?<=a)b/,
      /.*$/,
      /.*a|b/,
      /\w*\d{3}/,
      /[\s\S]*end/s,
      /.*\n/,
      /.*{/,
    ];
    const values = [
      "",
      "a",
      "ab",
      "a\nb",
      "\na",
      "xx\nab",
      "x.google.com",
      "https://example.com/ingest/e/?x=1",
      "https://EXAMPLE.COM/INGEST/",
      "https://example.com/ingest",
      "token=1",
      "?token=1",
      " token=",
      "/a?code=1",
      "/a#?code=1",
      "foo",
      "xfoo",
      "x foo",
      "aab",
      "a\nb",
      "abc123",
      "end",
      "x\nend",
      "{",
      "x{",
    ];
    const optimized = normalizePatterns(patterns, "ignoreUrls");
    for (let i = 0; i < patterns.length; i++) {
      expect(optimized[i]!.source).not.toBe(patterns[i]!.source);
      for (const value of values) {
        expect(optimized[i]!.test(value), `${patterns[i]} on ${JSON.stringify(value)}`).toBe(patterns[i]!.test(value));
      }
    }
  });
});

describe("matchesAny with global and sticky patterns", () => {
  it("matches a repeated value on every call", () => {
    const patterns = [/callback/g];
    for (let i = 0; i < 4; i++) {
      expect(testsWithoutCache(patterns, "/callback")).toBe(true);
    }
  });

  it("matches a sticky pattern from the start of every value", () => {
    const patterns = [/\/callback/y];
    expect(testsWithoutCache(patterns, "/callback")).toBe(true);
    expect(testsWithoutCache(patterns, "/callback")).toBe(true);
    expect(testsWithoutCache(patterns, "/x/callback")).toBe(false);
  });

  // A fresh array per call, so every call tests the pattern instead of reading a cached result.
  function testsWithoutCache(patterns: RegExp[], value: string) {
    return matchesAny([...patterns], value);
  }
});

describe("matchesAny result cache", () => {
  it("tests a repeated value only once", () => {
    const pattern = /\/callback/;
    const spy = vi.spyOn(pattern, "test");
    const patterns = [pattern];

    expect(matchesAny(patterns, "https://example.com/callback")).toBe(true);
    expect(matchesAny(patterns, "https://example.com/callback")).toBe(true);
    expect(matchesAny(patterns, "https://example.com/home")).toBe(false);
    expect(matchesAny(patterns, "https://example.com/home")).toBe(false);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps results per pattern list", () => {
    expect(matchesAny([/a/], "a")).toBe(true);
    expect(matchesAny([/b/], "a")).toBe(false);
  });

  it("keeps the most recently used values", () => {
    const pattern = /page/;
    const spy = vi.spyOn(pattern, "test");
    const patterns = [pattern];

    matchesAny(patterns, "page");
    for (let i = 0; i < 20; i++) {
      matchesAny(patterns, `request-${i}`);
      matchesAny(patterns, "page");
    }

    expect(spy.mock.calls.filter(([value]) => value === "page")).toHaveLength(1);
  });

  it("does not cache a value whose test throws", () => {
    const patterns = [{} as unknown as RegExp];
    expect(() => matchesAny(patterns, "x")).toThrow();
    expect(() => matchesAny(patterns, "x")).toThrow();
  });
});
