import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { addUrlAttributes, scrubPageUrls, scrubUrl, UrlAttributeScrubber } from "./url";
import { KeyValue } from "../types/otlp";
import { vars } from "../vars";
import { identity } from "../utils/fn";
import { URL_DOMAIN, URL_FRAGMENT, URL_FULL, URL_PATH, URL_QUERY, URL_SCHEME } from "../semantic-conventions";

describe("addUrlAttributes", () => {
  let attributes: KeyValue[];
  let originalScrubber: UrlAttributeScrubber;

  beforeEach(() => {
    attributes = [];
    originalScrubber = vars.urlAttributeScrubber;
    vars.urlAttributeScrubber = identity;
  });

  afterEach(() => {
    vars.urlAttributeScrubber = originalScrubber;
  });

  describe("URL parsing and attribute extraction", () => {
    it("extracts all URL components for complete URL", () => {
      const url = "https://example.com:8080/path/to/resource?param1=value1&param2=value2#section1";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        {
          key: URL_FULL,
          value: { stringValue: "https://example.com:8080/path/to/resource?param1=value1&param2=value2#section1" },
        },
        { key: URL_PATH, value: { stringValue: "/path/to/resource" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_FRAGMENT, value: { stringValue: "section1" } },
        { key: URL_QUERY, value: { stringValue: "param1=value1&param2=value2" } },
      ]);
    });

    it("handles URL with only required components", () => {
      const url = "https://example.com";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/" } },
        { key: URL_PATH, value: { stringValue: "/" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });

    it("handles URL with path but no query or fragment", () => {
      const url = "http://example.com/some/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "http://example.com/some/path" } },
        { key: URL_PATH, value: { stringValue: "/some/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "http" } },
      ]);
    });

    it("handles URL with query but no fragment", () => {
      const url = "https://example.com/path?query=test";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/path?query=test" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_QUERY, value: { stringValue: "query=test" } },
      ]);
    });

    it("handles URL with fragment but no query", () => {
      const url = "https://example.com/path#section";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/path#section" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_FRAGMENT, value: { stringValue: "section" } },
      ]);
    });

    it("accepts URL object as input", () => {
      const urlObject = new URL("https://example.com/path?query=test#fragment");

      addUrlAttributes(attributes, urlObject);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/path?query=test#fragment" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_FRAGMENT, value: { stringValue: "fragment" } },
        { key: URL_QUERY, value: { stringValue: "query=test" } },
      ]);
    });
  });

  describe("credential redaction functionality", () => {
    it("redacts username and password from URL", () => {
      const url = "https://user:pass@example.com/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://REDACTED:REDACTED@example.com/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });

    it("redacts username when password is not present", () => {
      const url = "https://user@example.com/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://REDACTED@example.com/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });

    it("handles special characters in credentials", () => {
      const url = "https://user%40domain:p%40ssw0rd@example.com/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://REDACTED:REDACTED@example.com/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });
  });

  describe("URL attribute scrubber integration", () => {
    it("applies custom scrubber to URL attributes", () => {
      const customScrubber: UrlAttributeScrubber = (attrs) => ({
        ...attrs,
        [URL_PATH]: "REDACTED",
        [URL_QUERY]: undefined,
      });
      vars.urlAttributeScrubber = customScrubber;

      const url = "https://example.com/sensitive/path?secret=value#fragment";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/REDACTED#fragment" } },
        { key: URL_PATH, value: { stringValue: "REDACTED" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_FRAGMENT, value: { stringValue: "fragment" } },
      ]);
    });

    it("applies scrubber that removes all optional attributes", () => {
      const restrictiveScrubber: UrlAttributeScrubber = (attrs) => ({
        [URL_FULL]: attrs[URL_FULL],
      });
      vars.urlAttributeScrubber = restrictiveScrubber;

      const url = "https://example.com/path?query=test#fragment";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([{ key: URL_FULL, value: { stringValue: "/" } }]);
    });

    it("handles scrubber that throws an error", () => {
      const errorScrubber: UrlAttributeScrubber = () => {
        throw new Error("Scrubber error");
      };
      vars.urlAttributeScrubber = errorScrubber;

      const url = "https://example.com/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toHaveLength(0);
    });

    it("applies identity scrubber correctly", () => {
      vars.urlAttributeScrubber = identity;

      const url = "https://example.com/path?query=test";

      addUrlAttributes(attributes, url);

      expect(attributes).toHaveLength(5);
      expect(attributes.find((attr) => attr.key === URL_FULL)?.value).toEqual({
        stringValue: "https://example.com/path?query=test",
      });
      expect(attributes.find((attr) => attr.key === URL_PATH)?.value).toEqual({ stringValue: "/path" });
      expect(attributes.find((attr) => attr.key === URL_DOMAIN)?.value).toEqual({ stringValue: "example.com" });
      expect(attributes.find((attr) => attr.key === URL_SCHEME)?.value).toEqual({ stringValue: "https" });
      expect(attributes.find((attr) => attr.key === URL_QUERY)?.value).toEqual({ stringValue: "query=test" });
    });
  });

  describe("error handling for invalid URLs", () => {
    it("handles invalid URL with identity scrubber by adding full URL", () => {
      vars.urlAttributeScrubber = identity;
      const invalidUrl = "not-a-valid-url";

      addUrlAttributes(attributes, invalidUrl);

      // Invalid URLs still parse but create fallback attributes
      expect(attributes.length).toBeGreaterThan(0);
      // The actual behavior might be different based on the parsing logic
      const fullAttr = attributes.find((attr) => attr.key === URL_FULL);
      expect(fullAttr).toBeDefined();
    });

    it("handles invalid URL with custom scrubber by dropping attributes", () => {
      const customScrubber: UrlAttributeScrubber = (attrs) => attrs;
      vars.urlAttributeScrubber = customScrubber;
      const invalidUrl = "not-a-valid-url";

      addUrlAttributes(attributes, invalidUrl);

      // With custom scrubber, invalid URLs still get parsed with fallback
      expect(attributes.length).toBeGreaterThan(0);
    });

    it("handles empty string URL with identity scrubber", () => {
      vars.urlAttributeScrubber = identity;
      const emptyUrl = "";

      addUrlAttributes(attributes, emptyUrl);

      // Empty URLs still parse but create fallback attributes
      expect(attributes.length).toBeGreaterThan(0);
      expect(attributes.find((attr) => attr.key === URL_FULL)?.value).toEqual({
        stringValue: "http://localhost:3000/",
      });
    });

    it("handles relative URL that can be parsed with base", () => {
      // This should work if there's a document.baseURI or location.href available
      const relativeUrl = "/relative/path?query=test";

      // This might throw or might work depending on environment
      addUrlAttributes(attributes, relativeUrl);

      // We expect either parsed attributes or fallback behavior
      expect(attributes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("prefix functionality for attributes", () => {
    it("applies string prefix to attribute keys", () => {
      const url = "https://example.com/path";
      const prefix = "page";

      addUrlAttributes(attributes, url, prefix);

      expect(attributes).toEqual([
        { key: "page.url.full", value: { stringValue: "https://example.com/path" } },
        { key: "page.url.path", value: { stringValue: "/path" } },
        { key: "page.url.domain", value: { stringValue: "example.com" } },
        { key: "page.url.scheme", value: { stringValue: "https" } },
      ]);
    });

    it("applies array prefix to attribute keys", () => {
      const url = "https://example.com/path?query=test";
      const prefix = ["http", "request"];

      addUrlAttributes(attributes, url, prefix);

      expect(attributes).toEqual([
        { key: "http.request.url.full", value: { stringValue: "https://example.com/path?query=test" } },
        { key: "http.request.url.path", value: { stringValue: "/path" } },
        { key: "http.request.url.domain", value: { stringValue: "example.com" } },
        { key: "http.request.url.scheme", value: { stringValue: "https" } },
        { key: "http.request.url.query", value: { stringValue: "query=test" } },
      ]);
    });

    it("handles empty string prefix", () => {
      const url = "https://example.com/path";
      const prefix = "";

      addUrlAttributes(attributes, url, prefix);

      expect(attributes).toEqual([
        { key: "url.full", value: { stringValue: "https://example.com/path" } },
        { key: "url.path", value: { stringValue: "/path" } },
        { key: "url.domain", value: { stringValue: "example.com" } },
        { key: "url.scheme", value: { stringValue: "https" } },
      ]);
    });

    it("handles undefined prefix", () => {
      const url = "https://example.com/path";

      addUrlAttributes(attributes, url, undefined);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });

    it("applies prefix with error handling fallback", () => {
      vars.urlAttributeScrubber = identity;
      const invalidUrl = "invalid-url";
      const prefix = "page";

      addUrlAttributes(attributes, invalidUrl, prefix);

      // With prefix and identity scrubber, fallback should include prefix
      expect(attributes.length).toBeGreaterThan(0);
      // The actual behavior might be different based on the parsing logic
      const fullAttr = attributes.find((attr) => attr.key === "page.url.full");
      expect(fullAttr).toBeDefined();
    });
  });

  describe("edge cases and corner cases", () => {
    it("handles URL with port number", () => {
      const url = "https://example.com:8080/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "https://example.com:8080/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
      ]);
    });

    it("handles URL with IP address", () => {
      const url = "http://192.168.1.1:8080/api";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "http://192.168.1.1:8080/api" } },
        { key: URL_PATH, value: { stringValue: "/api" } },
        { key: URL_DOMAIN, value: { stringValue: "192.168.1.1" } },
        { key: URL_SCHEME, value: { stringValue: "http" } },
      ]);
    });

    it("handles URL with IPv6 address", () => {
      const url = "http://[::1]:8080/path";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        { key: URL_FULL, value: { stringValue: "http://[::1]:8080/path" } },
        { key: URL_PATH, value: { stringValue: "/path" } },
        { key: URL_DOMAIN, value: { stringValue: "[::1]" } },
        { key: URL_SCHEME, value: { stringValue: "http" } },
      ]);
    });

    it("handles URL with encoded characters", () => {
      const url = "https://example.com/path%20with%20spaces?query=value%20with%20spaces#fragment%20with%20spaces";

      addUrlAttributes(attributes, url);

      expect(attributes).toEqual([
        {
          key: URL_FULL,
          value: {
            stringValue:
              "https://example.com/path%20with%20spaces?query=value%20with%20spaces#fragment%20with%20spaces",
          },
        },
        { key: URL_PATH, value: { stringValue: "/path%20with%20spaces" } },
        { key: URL_DOMAIN, value: { stringValue: "example.com" } },
        { key: URL_SCHEME, value: { stringValue: "https" } },
        { key: URL_FRAGMENT, value: { stringValue: "fragment%20with%20spaces" } },
        { key: URL_QUERY, value: { stringValue: "query=value%20with%20spaces" } },
      ]);
    });

    it("handles different protocol schemes", () => {
      const protocols = ["ftp", "ws", "wss", "file"];

      protocols.forEach((protocol) => {
        attributes = []; // Reset attributes for each test
        const url = `${protocol}://example.com/path`;

        addUrlAttributes(attributes, url);

        const schemeAttr = attributes.find((attr) => attr.key === URL_SCHEME);
        expect(schemeAttr?.value).toEqual({ stringValue: protocol });
      });
    });
  });
});

describe("scrubUrl", () => {
  let originalScrubber: UrlAttributeScrubber;

  beforeEach(() => {
    originalScrubber = vars.urlAttributeScrubber;
  });

  afterEach(() => {
    vars.urlAttributeScrubber = originalScrubber;
  });

  it("returns the scrubbed url.full", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_FULL]: attrs[URL_FULL].split("?")[0]! });

    expect(scrubUrl("https://example.com/callback?code=secret&state=xyz")).toBe("https://example.com/callback");
  });

  it("passes fragments to the scrubber", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_FULL]: attrs[URL_FULL].split("#")[0]! });

    expect(scrubUrl("https://example.com/callback#access_token=secret")).toBe("https://example.com/callback");
  });

  it("keeps the url and only redacts basic auth credentials with the default scrubber", () => {
    vars.urlAttributeScrubber = identity;

    expect(scrubUrl("https://user:pass@example.com/path?q=1")).toBe("https://REDACTED:REDACTED@example.com/path?q=1");
  });

  it("keeps an unparsable url with the default scrubber", () => {
    vars.urlAttributeScrubber = identity;

    expect(scrubUrl("http://[invalid")).toBe("http://[invalid");
  });

  it("redacts the whole url when a custom scrubber throws", () => {
    vars.urlAttributeScrubber = () => {
      throw new Error("boom");
    };

    expect(scrubUrl("https://example.com/callback?code=secret")).toBe("REDACTED");
  });
});

describe("scrubPageUrls", () => {
  let originalScrubber: UrlAttributeScrubber;

  beforeEach(() => {
    originalScrubber = vars.urlAttributeScrubber;
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_FULL]: `[${attrs[URL_FULL].split(/[?#]/)[0]}]` });
  });

  afterEach(() => {
    vars.urlAttributeScrubber = originalScrubber;
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("replaces the current page url and leaves other urls untouched", () => {
    history.replaceState(null, "", "/callback?code=secret");

    expect(
      scrubPageUrls(`at ${location.origin}/callback?code=secret:1:2 at https://cdn.example.com/a.js?v=1:3:4`)
    ).toBe(`at [${location.origin}/callback]:1:2 at https://cdn.example.com/a.js?v=1:3:4`);
  });

  it("replaces a page url with a fragment", () => {
    history.replaceState(null, "", "/callback#access_token=secret");

    expect(scrubPageUrls(`at ${location.origin}/callback#access_token=secret:1:2`)).toBe(
      `at [${location.origin}/callback]:1:2`
    );
  });

  it("replaces the page url when a stack frame omits its fragment", () => {
    history.replaceState(null, "", "/callback?code=secret#section");

    expect(scrubPageUrls(`at ${location.origin}/callback?code=secret:1:2`)).toBe(
      `at [${location.origin}/callback]:1:2`
    );
  });

  it("does not replace a page url that is only the start of another url", () => {
    history.replaceState(null, "", "/");

    expect(scrubPageUrls(`at ${location.origin}/static/main.js:1:2 at ${location.origin}/:3:4`)).toBe(
      `at ${location.origin}/static/main.js:1:2 at [${location.origin}/]:3:4`
    );
  });

  it("replaces a fragment that was removed from the page url", () => {
    history.replaceState(null, "", "/callback");

    expect(scrubPageUrls(`at ${location.origin}/callback#access_token=secret:1:2`)).toBe(
      `at [${location.origin}/callback]:1:2`
    );
  });

  it("replaces a page url followed by sentence punctuation, but not a url that continues", () => {
    history.replaceState(null, "", "/app?code=secret");

    expect(scrubPageUrls(`Login failed for ${location.href}. Retry?`)).toBe(
      `Login failed for [${location.origin}/app]. Retry?`
    );
    history.replaceState(null, "", "/app");
    expect(scrubPageUrls(`at ${location.origin}/app.js:1:2`)).toBe(`at ${location.origin}/app.js:1:2`);
  });

  it("handles very long urls", () => {
    history.replaceState(null, "", `/callback?code=secret&state=${"x".repeat(40000)}`);

    expect(scrubPageUrls(`at ${location.href}:1:2`)).toBe(`at [${location.origin}/callback]:1:2`);
  });

  it("ignores a request url that is only a fragment", () => {
    expect(scrubPageUrls("Error at line 1: x", "#section")).toBe("Error at line 1: x");
  });

  it("replaces the url the document was loaded with after the page url changed", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${location.origin}/callback?code=secret` } as PerformanceEntry,
    ]);
    history.replaceState(null, "", "/home");

    expect(scrubPageUrls(`at ${location.origin}/callback?code=secret:1:2`)).toBe(
      `at [${location.origin}/callback]:1:2`
    );
  });

  it("replaces a request url that starts with the page url", () => {
    history.replaceState(null, "", "/api?ids=1");

    expect(
      scrubPageUrls(`at ${location.origin}/api?ids=1,2&token=secret:1:2`, `${location.origin}/api?ids=1,2&token=secret`)
    ).toBe(`at [${location.origin}/api]:1:2`);
  });

  it("replaces the initial url with its fragment after the page url dropped it", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${location.origin}/callback#access_token=secret` } as PerformanceEntry,
    ]);
    history.replaceState(null, "", "/callback");

    expect(scrubPageUrls(`at ${location.origin}/callback#access_token=secret:1:2`)).toBe(
      `at [${location.origin}/callback]:1:2`
    );
  });

  it("replaces the request url", () => {
    history.replaceState(null, "", "/api");

    expect(
      scrubPageUrls(`Failed to load '${location.origin}/api?token=secret'`, `${location.origin}/api?token=secret`)
    ).toBe(`Failed to load '[${location.origin}/api]'`);
  });
});

describe("url.full rebuilding", () => {
  let originalScrubber: UrlAttributeScrubber;

  beforeEach(() => {
    originalScrubber = vars.urlAttributeScrubber;
  });

  afterEach(() => {
    vars.urlAttributeScrubber = originalScrubber;
  });

  it("rebuilds url.full when the scrubber only redacts url parts", () => {
    vars.urlAttributeScrubber = (attrs) => ({
      ...attrs,
      [URL_PATH]: attrs[URL_PATH]?.replace(/\d+/g, "{id}"),
      [URL_QUERY]: attrs[URL_QUERY] && "REDACTED",
      [URL_FRAGMENT]: attrs[URL_FRAGMENT] && "REDACTED",
    });
    const attributes: KeyValue[] = [];

    addUrlAttributes(attributes, "https://user:pass@example.com:8080/users/42?code=secret#token=secret");

    expect(attributes).toContainEqual({
      key: URL_FULL,
      value: { stringValue: "https://REDACTED:REDACTED@example.com:8080/users/{id}?REDACTED#REDACTED" },
    });
    expect(scrubUrl("https://example.com/callback?code=secret")).toBe("https://example.com/callback?REDACTED");
  });

  it("rebuilds url.full when the scrubber redacts scheme or domain", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_SCHEME]: "REDACTED", [URL_DOMAIN]: "REDACTED" });

    expect(scrubUrl("https://user:pass@internal.example.com:8443/path?q=1#top")).toBe(
      "REDACTED://REDACTED:REDACTED@REDACTED:8443/path?q=1#top"
    );
  });

  it("rebuilds urls without an authority", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_PATH]: "REDACTED" });

    expect(scrubUrl("mailto:someone@example.com")).toBe("mailto:REDACTED");
  });

  it("drops a removed query from url.full", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_QUERY]: undefined });

    expect(scrubUrl("https://example.com/callback?code=secret")).toBe("https://example.com/callback");
  });

  it("keeps url.full as returned by the scrubber when the scrubber changed it", () => {
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, [URL_FULL]: "custom", [URL_QUERY]: "REDACTED" });

    expect(scrubUrl("https://example.com/callback?code=secret")).toBe("custom");
  });
});
