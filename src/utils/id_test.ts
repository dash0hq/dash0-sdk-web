import { expect, describe, it } from "vitest";
import { generateUniqueId } from "./id";

// Create a wrapper function for testing
function generateId(length: number): string {
  if (typeof length !== "number") {
    throw new Error("Length must be a number");
  }

  if (length < 1) {
    throw new Error("Length must be greater than 0");
  }

  return generateUniqueId(Math.ceil(length / 2)).substring(0, length);
}

describe("generateId", () => {
  it("returns a string of the expected length", () => {
    const id = generateId(10);
    expect(id).toHaveLength(10);
  });

  it("returns a unique ID on each call", () => {
    const id1 = generateId(10);
    const id2 = generateId(10);
    expect(id1).not.toBe(id2);
  });

  it("throws an error if length is less than 1", () => {
    expect(() => generateId(0)).toThrow("Length must be greater than 0");
  });

  it("throws an error if length is not a number", () => {
    expect(() => generateId("abc" as any)).toThrow("Length must be a number");
  });

  it("handles large lengths without errors", () => {
    const id = generateId(1000);
    expect(id).toHaveLength(1000);
  });
});
