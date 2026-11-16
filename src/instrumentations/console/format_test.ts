import { describe, expect, it } from "vitest";
import { formatConsoleArgs } from "./format";
import { doc } from "../../utils";

const format = (...args: unknown[]) => formatConsoleArgs(args, 4096).text;

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

  it("does not run getters or setters", () => {
    let reads = 0;
    const obj = {
      plain: 1,
      get lazy() {
        reads++;
        return 2;
      },
      get broken(): number {
        throw new Error("nope");
      },
      get both() {
        reads++;
        return 3;
      },
      set both(_v: number) {},
      set writeOnly(_v: number) {},
    };

    expect(format(obj)).toBe(
      '{"plain":1,"lazy":[Getter],"broken":[Getter],"both":[Getter/Setter],"writeOnly":[Setter]}'
    );
    expect(reads).toBe(0);
  });

  it("reads property values of proxies without their get trap", () => {
    const read: PropertyKey[] = [];
    const reactive = new Proxy(
      { items: [1, 2] },
      {
        get(target, key, receiver) {
          read.push(key);
          return Reflect.get(target, key, receiver);
        },
      }
    );

    expect(format(reactive)).toBe('{"items":[1,2]}');
    // The type checks still read a few well-known keys, such as `nodeType`, but no property is read for its value.
    expect(read).not.toContain("items");
  });

  it("marks properties whose descriptor cannot be read", () => {
    const hostile = new Proxy([1, 2], {
      getOwnPropertyDescriptor(target, key) {
        if (key === "1") throw new Error("nope");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(format(hostile)).toBe("[1,[Unreadable]]");
  });

  it("writes typed arrays like arrays and reads only their first entries", () => {
    expect(format(new Float64Array([1.5, 2]))).toBe("[1.5,2]");
    expect(format(new BigInt64Array([BigInt(7)]))).toBe("[7n]");
    expect(format(new Uint8Array(1000000))).toMatch(/^\[0(,0){49},…999950 more\]$/);
  });

  it("truncates to the maximum length and reports it", () => {
    expect(formatConsoleArgs(["a".repeat(20)], 10)).toEqual({ text: "a".repeat(10), truncated: true });
    expect(formatConsoleArgs(["a".repeat(10)], 10)).toEqual({ text: "a".repeat(10), truncated: false });
    expect(formatConsoleArgs(["short"], 10)).toEqual({ text: "short", truncated: false });
  });

  it("cuts large strings, top-level and nested", () => {
    const huge = "a".repeat(1000000);
    expect(formatConsoleArgs([huge], 10)).toEqual({ text: "a".repeat(10), truncated: true });
    expect(formatConsoleArgs([{ s: huge }], 10)).toEqual({ text: '{"s":"aaaa', truncated: true });
  });

  it("stops serializing large objects once the maximum length is reached", () => {
    let visited = 0;
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++) {
      // Counts how many of the values are serialized: `Object.keys` runs the `ownKeys` trap once per value.
      big[`key${i}`] = new Proxy(
        { s: "x".repeat(100) },
        {
          ownKeys(target) {
            visited++;
            return Reflect.ownKeys(target);
          },
        }
      );
    }

    const result = formatConsoleArgs([big], 200);

    expect(result.text).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(visited).toBeLessThan(5);
  });
});
