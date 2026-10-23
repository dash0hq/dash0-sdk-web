import { beforeEach, describe, expect, it, vi } from "vitest";

type Module = typeof import("./on-last-chance");

describe("onLastChance", () => {
  // Fresh modules per test, so registered callbacks and the unloading state never leak between tests.
  let mod: Module;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("./on-last-chance");
  });

  it("runs callbacks with a lower priority first, and equal priorities in registration order", () => {
    const calls: string[] = [];
    mod.onLastChance(() => calls.push("flush"), mod.LAST_CHANCE_PRIORITY_BATCH_FLUSH);
    mod.onLastChance(() => calls.push("first producer"));
    mod.onLastChance(() => calls.push("second producer"), mod.LAST_CHANCE_PRIORITY_PRODUCER);

    globalThis.dispatchEvent(new Event("pagehide"));

    expect(calls).toEqual(["first producer", "second producer", "flush"]);
  });

  it("runs all callbacks when one of them throws", () => {
    const flush = vi.fn();
    mod.onLastChance(flush, mod.LAST_CHANCE_PRIORITY_BATCH_FLUSH);
    mod.onLastChance(() => {
      throw new Error("boom");
    });

    globalThis.dispatchEvent(new Event("pagehide"));

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("runs a callback immediately when it is registered while the page is unloading", () => {
    // The unload listeners are only added with the first callback.
    mod.onLastChance(() => {});
    globalThis.dispatchEvent(new Event("beforeunload"));
    const fn = vi.fn();

    mod.onLastChance(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
