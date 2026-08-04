import { afterEach, describe, expect, it, vi } from "vitest";
import { clearActiveInteractionForTests, getActiveInteraction, registerActiveInteraction } from "./active-interaction";

describe("active interaction tracking", () => {
  afterEach(() => {
    clearActiveInteractionForTests();
    vi.restoreAllMocks();
  });

  it("returns the registered interaction within the attribution window", () => {
    const registered = registerActiveInteraction("Save Part");

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.id).toBe(registered.id);
    expect(active!.name).toBe("Save Part");
    expect(active!.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("expires the interaction after the attribution window", () => {
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(100_000);
    registerActiveInteraction("Save Part");

    now.mockReturnValue(101_999);
    expect(getActiveInteraction()).toBeDefined();

    now.mockReturnValue(102_001); // > 2000ms after registration
    expect(getActiveInteraction()).toBeUndefined();

    // and stays gone even if time goes on
    now.mockReturnValue(103_000);
    expect(getActiveInteraction()).toBeUndefined();
  });

  it("a new click replaces the previous interaction", () => {
    const first = registerActiveInteraction("First");
    const second = registerActiveInteraction("Second");

    expect(second.id).not.toBe(first.id);
    expect(getActiveInteraction()!.id).toBe(second.id);
    expect(getActiveInteraction()!.name).toBe("Second");
  });

  it("keeps a blank name for unnamed interactions (id still joins the event to its requests)", () => {
    registerActiveInteraction("");

    const active = getActiveInteraction();
    expect(active).toBeDefined();
    expect(active!.name).toBe("");
    expect(active!.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns undefined when no interaction was ever registered", () => {
    expect(getActiveInteraction()).toBeUndefined();
  });
});
