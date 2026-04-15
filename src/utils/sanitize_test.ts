import { describe, expect, it } from "vitest";
import { isSafeServiceName } from "./sanitize";

describe("isSafeServiceName", () => {
  describe("accepts safe values", () => {
    it.each([
      "my-service",
      "my_service",
      "my.service",
      "MyService123",
      "myteam/myservice",
      "myteam\\myservice",
      "service with spaces",
      "service-name.v2",
      "résumé-service",
      "サービス",
      "a",
    ])("accepts %j", (value) => {
      expect(isSafeServiceName(value)).toBe(true);
    });

    it("accepts the empty string (empty/whitespace handling lives elsewhere)", () => {
      expect(isSafeServiceName("")).toBe(true);
    });
  });

  describe("rejects suspicious characters", () => {
    it.each([
      ["single quote", "evil';DROP TABLE"],
      ["double quote", 'say "hi"'],
      ["semicolon", "a;b"],
      ["open brace", "${injected}"],
      ["close brace", "trailing}"],
      ["less-than", "<script>"],
      ["greater-than", "value>other"],
    ])("rejects %s", (_label, value) => {
      expect(isSafeServiceName(value)).toBe(false);
    });

    it("rejects NUL", () => {
      expect(isSafeServiceName("a\x00b")).toBe(false);
    });

    it("rejects embedded newline (log injection)", () => {
      expect(isSafeServiceName("line1\nline2")).toBe(false);
    });

    it("rejects embedded carriage return", () => {
      expect(isSafeServiceName("a\rb")).toBe(false);
    });

    it("rejects embedded tab", () => {
      expect(isSafeServiceName("a\tb")).toBe(false);
    });

    it("rejects DEL", () => {
      expect(isSafeServiceName("a\x7Fb")).toBe(false);
    });
  });
});
