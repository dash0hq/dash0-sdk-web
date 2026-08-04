import { expect, describe, it } from "vitest";
import { addAttribute, findLastAttribute, toAnyValue } from "./attributes";
import { AnyValue, KeyValue } from "../../types/otlp";

describe("toAnyValue", () => {
  describe("primitive values", () => {
    it("converts string values to stringValue", () => {
      const result = toAnyValue("hello");
      expect(result).toEqual({ stringValue: "hello" });
    });

    it("converts number values to doubleValue", () => {
      const result = toAnyValue(42);
      expect(result).toEqual({ doubleValue: 42 });
    });

    it("converts boolean true to boolValue", () => {
      const result = toAnyValue(true);
      expect(result).toEqual({ boolValue: true });
    });

    it("converts boolean false to boolValue", () => {
      const result = toAnyValue(false);
      expect(result).toEqual({ boolValue: false });
    });

    it("converts zero to doubleValue", () => {
      const result = toAnyValue(0);
      expect(result).toEqual({ doubleValue: 0 });
    });

    it("converts negative numbers to doubleValue", () => {
      const result = toAnyValue(-123.45);
      expect(result).toEqual({ doubleValue: -123.45 });
    });

    it("converts empty string to stringValue", () => {
      const result = toAnyValue("");
      expect(result).toEqual({ stringValue: "" });
    });
  });

  describe("array values", () => {
    it("converts array of strings to arrayValue", () => {
      const result = toAnyValue(["a", "b", "c"]);
      expect(result).toEqual({
        arrayValue: {
          values: [{ stringValue: "a" }, { stringValue: "b" }, { stringValue: "c" }],
        },
      });
    });

    it("converts array of numbers to arrayValue", () => {
      const result = toAnyValue([1, 2, 3]);
      expect(result).toEqual({
        arrayValue: {
          values: [{ doubleValue: 1 }, { doubleValue: 2 }, { doubleValue: 3 }],
        },
      });
    });

    it("converts array of booleans to arrayValue", () => {
      const result = toAnyValue([true, false]);
      expect(result).toEqual({
        arrayValue: {
          values: [{ boolValue: true }, { boolValue: false }],
        },
      });
    });

    it("converts mixed array to arrayValue", () => {
      const result = toAnyValue([1, "hello", true]);
      expect(result).toEqual({
        arrayValue: {
          values: [{ doubleValue: 1 }, { stringValue: "hello" }, { boolValue: true }],
        },
      });
    });

    it("converts empty array to arrayValue", () => {
      const result = toAnyValue([]);
      expect(result).toEqual({
        arrayValue: {
          values: [],
        },
      });
    });
  });

  describe("object values", () => {
    it("converts simple object to kvlistValue", () => {
      const result = toAnyValue({ name: "John", age: 30 });
      expect(result).toEqual({
        kvlistValue: {
          values: [
            { key: "name", value: { stringValue: "John" } },
            { key: "age", value: { doubleValue: 30 } },
          ],
        },
      });
    });

    it("converts empty object to kvlistValue", () => {
      const result = toAnyValue({});
      expect(result).toEqual({
        kvlistValue: {
          values: [],
        },
      });
    });

    it("converts object with mixed value types", () => {
      const result = toAnyValue({
        str: "text",
        num: 42,
        bool: true,
      });
      expect(result).toEqual({
        kvlistValue: {
          values: [
            { key: "str", value: { stringValue: "text" } },
            { key: "num", value: { doubleValue: 42 } },
            { key: "bool", value: { boolValue: true } },
          ],
        },
      });
    });
  });

  describe("AnyValue passthrough", () => {
    it("returns existing AnyValue unchanged", () => {
      const anyValue: AnyValue = { stringValue: "test" };
      const result = toAnyValue(anyValue);
      expect(result).toBe(anyValue);
    });

    it("returns existing doubleValue AnyValue unchanged", () => {
      const anyValue: AnyValue = { doubleValue: 123 };
      const result = toAnyValue(anyValue);
      expect(result).toBe(anyValue);
    });

    it("returns existing boolValue AnyValue unchanged", () => {
      const anyValue: AnyValue = { boolValue: false };
      const result = toAnyValue(anyValue);
      expect(result).toBe(anyValue);
    });

    it("returns existing arrayValue AnyValue unchanged", () => {
      const anyValue: AnyValue = {
        arrayValue: {
          values: [{ stringValue: "test" }],
        },
      };
      const result = toAnyValue(anyValue);
      expect(result).toBe(anyValue);
    });

    it("returns existing kvlistValue AnyValue unchanged", () => {
      const anyValue: AnyValue = {
        kvlistValue: {
          values: [{ key: "test", value: { stringValue: "value" } }],
        },
      };
      const result = toAnyValue(anyValue);
      expect(result).toBe(anyValue);
    });
  });

  describe("undefined and null handling", () => {
    it("returns undefined for undefined", () => {
      const result = toAnyValue(undefined);
      expect(result).toBeUndefined();
    });

    it("returns undefined for null", () => {
      const result = toAnyValue(null as any);
      expect(result).toBeUndefined();
    });
  });

  describe("addAttribute", () => {
    it("adds attributes to attribute set", () => {
      const attributes: KeyValue[] = [];

      addAttribute(attributes, "some.attribute", { stringValue: "a value" });

      expect(attributes).toEqual(expect.arrayContaining([expect.objectContaining({ key: "some.attribute" })]));
    });

    it("ignores attributes without key", () => {
      const attributes: KeyValue[] = [];

      addAttribute(attributes, "", { stringValue: "a value" });

      expect(attributes).toHaveLength(0);
    });
  });
});

describe("findLastAttribute", () => {
  it("finds an attribute by key", () => {
    const attributes: KeyValue[] = [];
    addAttribute(attributes, "a", "first");
    addAttribute(attributes, "b", "second");

    expect(findLastAttribute(attributes, "b")).toEqual({ key: "b", value: { stringValue: "second" } });
  });

  it("returns the last entry when a key appears more than once", () => {
    // Callers rely on this: addCommonAttributes splices user-supplied
    // signalAttributes in before deriving the SDK's own attributes, so the
    // SDK-derived value must win.
    const attributes: KeyValue[] = [];
    addAttribute(attributes, "page.url.path", "/spoofed");
    addAttribute(attributes, "page.url.path", "/derived");

    expect(findLastAttribute(attributes, "page.url.path")).toEqual({
      key: "page.url.path",
      value: { stringValue: "/derived" },
    });
  });

  it("returns undefined for a missing key", () => {
    const attributes: KeyValue[] = [];
    addAttribute(attributes, "a", "first");

    expect(findLastAttribute(attributes, "missing")).toBeUndefined();
  });

  it("returns undefined for an empty attribute set", () => {
    expect(findLastAttribute([], "a")).toBeUndefined();
  });
});
