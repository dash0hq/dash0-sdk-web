import { describe, it, expect } from "vitest";
import { pick } from "./pick";

describe("pick", () => {
  it("should pick specified properties from an object", () => {
    const source = {
      name: "John",
      age: 30,
      email: "john@example.com",
      city: "New York",
    };

    const result = pick(source, ["name", "age"]);

    expect(result).toEqual({
      name: "John",
      age: 30,
    });
  });

  it("should return empty object when picking from empty object", () => {
    const source = {};
    const result = pick(source, ["name", "age"] as any);

    expect(result).toEqual({});
  });

  it("should handle picking non-existent properties", () => {
    const source = {
      name: "John",
      age: 30,
    };

    const result = pick(source, ["name", "nonExistent"] as any);

    expect(result).toEqual({
      name: "John",
    });
  });

  it("should pick all properties when all keys are specified", () => {
    const source = {
      a: 1,
      b: 2,
      c: 3,
    };

    const result = pick(source, ["a", "b", "c"]);

    expect(result).toEqual(source);
    expect(result).not.toBe(source); // Should be a new object
  });

  it("should return empty object when no keys are specified", () => {
    const source = {
      name: "John",
      age: 30,
    };

    const result = pick(source, []);

    expect(result).toEqual({});
  });

  it("should preserve property values including falsy ones", () => {
    const source = {
      name: "",
      age: 0,
      active: false,
      data: null,
      info: undefined,
    };

    const result = pick(source, ["name", "age", "active", "data", "info"]);

    expect(result).toEqual({
      name: "",
      age: 0,
      active: false,
      data: null,
      info: undefined,
    });
  });

  it("should work with nested objects", () => {
    const source = {
      user: {
        name: "John",
        age: 30,
      },
      settings: {
        theme: "dark",
      },
      isActive: true,
    };

    const result = pick(source, ["user", "isActive"]);

    expect(result).toEqual({
      user: {
        name: "John",
        age: 30,
      },
      isActive: true,
    });
    expect(result.user).toBe(source.user); // Should reference the same nested object
  });

  it("should maintain type safety", () => {
    interface User {
      id: number;
      name: string;
      email: string;
      isActive: boolean;
    }

    const user: User = {
      id: 1,
      name: "John",
      email: "john@example.com",
      isActive: true,
    };

    const result = pick(user, ["id", "name"]);

    // TypeScript should infer the type as Pick<User, 'id' | 'name'>
    expect(result.id).toBe(1);
    expect(result.name).toBe("John");
    expect(result).toEqual({
      id: 1,
      name: "John",
    });
  });
});
