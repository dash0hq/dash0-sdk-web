import { describe, expect, it } from "vitest";
import { formatConsoleArgs } from "./format";
import { doc } from "../../utils";

const format = (...args: unknown[]) => formatConsoleArgs(args, 4096);

describe("formatConsoleArgs", () => {
  it("joins arguments with spaces and writes strings as they are", () => {
    expect(format("user", "signed in", 42, true, null, undefined)).toBe("user signed in 42 true null undefined");
  });

  it("applies format directives of a leading string", () => {
    expect(format("%s has %d items costing %f", "cart", "3.7", "9.5")).toBe("cart has 3 items costing 9.5");
    expect(format("%i%%", 50.9)).toBe("50%");
    expect(format("%o and %O", { a: 1 }, [1, 2])).toBe('{"a":1} and [1,2]');
  });

  it("drops css styles", () => {
    expect(format("%cbold%c text", "font-weight: bold", "")).toBe("bold text");
  });

  it("keeps directives without a matching argument and appends unused arguments", () => {
    expect(format("%s and %s", "one")).toBe("one and %s");
    expect(format("%s", "one", "two", { three: 3 })).toBe('one two {"three":3}');
    expect(format("100%", "done")).toBe("100% done");
  });

  it("serializes objects, nested strings as JSON", () => {
    expect(format({ name: "x", tags: ["a", "b"], nested: { ok: true } })).toBe(
      '{"name":"x","tags":["a","b"],"nested":{"ok":true}}'
    );
  });

  it("marks circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    expect(format(obj)).toBe('{"a":1,"self":[Circular]}');
  });

  it("writes repeated, non-circular references in full", () => {
    const shared = { x: 1 };
    expect(format({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it("limits depth and entry count", () => {
    expect(format({ a: { b: { c: { d: 1 } } } })).toBe('{"a":{"b":{"c":[Object]}}}');
    expect(format(Array.from({ length: 52 }, (_, i) => i))).toMatch(/,49,…2 more\]$/);
  });

  it("describes errors, functions, dates, elements and other primitives", () => {
    expect(format("failed:", new TypeError("boom"))).toBe("failed: TypeError: boom");
    expect(format(function namedFn() {})).toBe("[Function: namedFn]");
    expect(format(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
    expect(format(BigInt(7), Symbol("s"), /re/g)).toBe("7n Symbol(s) /re/g");

    const el = doc!.createElement("button");
    el.id = "buy";
    el.className = "primary large";
    expect(format(el)).toBe('<button id="buy" class="primary large">');
  });

  it("tolerates getters that throw", () => {
    const obj = {
      get broken() {
        throw new Error("nope");
      },
    };
    expect(format(obj)).toBe('{"broken":"[Unreadable]"}');
  });

  it("truncates to the maximum length", () => {
    expect(formatConsoleArgs(["a".repeat(20)], 10)).toBe("a".repeat(10) + "…");
    expect(formatConsoleArgs(["short"], 10)).toBe("short");
  });

  it("stops serializing large objects once the maximum length is reached", () => {
    let reads = 0;
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++) {
      Object.defineProperty(big, `key${i}`, {
        enumerable: true,
        get() {
          reads++;
          return "x".repeat(100);
        },
      });
    }

    const result = formatConsoleArgs([big], 200);

    expect(result).toHaveLength(201);
    expect(reads).toBeLessThan(5);
  });
});
