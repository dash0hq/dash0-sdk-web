import { describe, expect, it, vi } from "vitest";
import { wrap } from "./wrap";

describe("wrap", () => {
  it("replaces the target with the wrapper's return value", () => {
    const original = () => "original";
    const module = { fn: original };

    wrap(module, "fn", (orig) => () => `wrapped ${orig()}`);

    expect(module.fn()).toBe("wrapped original");
  });

  it("does not wrap the same target twice", () => {
    const module = { fn: () => "original" };
    const wrapper = vi.fn((orig: () => string) => () => `wrapped ${orig()}`);

    wrap(module, "fn", wrapper);
    wrap(module, "fn", wrapper);

    expect(wrapper).toHaveBeenCalledTimes(1);
    expect(module.fn()).toBe("wrapped original");
  });

  it("skips undefined targets", () => {
    const module: { fn?: () => string } = {};
    const wrapper = vi.fn();

    expect(() => wrap(module, "fn", wrapper)).not.toThrow();
    expect(wrapper).not.toHaveBeenCalled();
  });

  it("does not throw when the page locked the target property", () => {
    const original = () => "original";
    const module = {} as { fn: () => string };
    Object.defineProperty(module, "fn", { value: original, writable: false, configurable: false });

    expect(() => wrap(module, "fn", (orig) => () => `wrapped ${orig()}`)).not.toThrow();
    expect(module.fn).toBe(original);
  });
});
