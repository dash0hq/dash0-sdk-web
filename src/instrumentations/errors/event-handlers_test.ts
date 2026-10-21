import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { countWrappedDomEventListeners } from "./async-function-wrapping";
import { wrapEventTarget } from "./event-handlers";
import { reportUnhandledError } from "./unhandled-error";
import { doc, win } from "../../utils";

vi.mock("./unhandled-error", () => ({
  reportUnhandledError: vi.fn(),
  ignoreNextOnErrorEvent: vi.fn(),
}));

describe("event handler wrapping", () => {
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  let target: HTMLDivElement;

  beforeAll(() => {
    wrapEventTarget(win!.EventTarget);
  });

  afterAll(() => {
    EventTarget.prototype.addEventListener = originalAdd;
    EventTarget.prototype.removeEventListener = originalRemove;
  });

  beforeEach(() => {
    target = doc!.createElement("div");
    vi.mocked(reportUnhandledError).mockClear();
  });

  function click() {
    target.dispatchEvent(new Event("click"));
  }

  it("invokes the listener and stops after removeEventListener", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener);
    click();
    target.removeEventListener("click", listener);
    click();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(countWrappedDomEventListeners(target)).toBe(0);
  });

  it("keeps ignoring duplicate registrations of the same listener", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener);
    target.addEventListener("click", listener);
    click();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(countWrappedDomEventListeners(target)).toBe(1);
  });

  it("treats capture and bubble registrations as separate listeners", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener, true);
    target.addEventListener("click", listener, { capture: false });
    click();
    expect(listener).toHaveBeenCalledTimes(2);

    target.removeEventListener("click", listener, { capture: true });
    click();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(countWrappedDomEventListeners(target)).toBe(1);
  });

  it("forgets a once listener after it ran", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener, { once: true });
    click();
    click();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(countWrappedDomEventListeners(target)).toBe(0);
  });

  it("allows registering a once listener again after it ran", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener, { once: true });
    click();
    target.addEventListener("click", listener, { once: true });
    click();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(countWrappedDomEventListeners(target)).toBe(0);
  });

  it("forgets a listener when its signal aborts", () => {
    const listener = vi.fn();
    const controller = new AbortController();
    target.addEventListener("click", listener, { signal: controller.signal });
    click();
    controller.abort();
    click();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(countWrappedDomEventListeners(target)).toBe(0);
    // The bookkeeping listener on the signal is not tracked either.
    expect(countWrappedDomEventListeners(controller.signal)).toBe(0);
  });

  it("does not register a listener with an already aborted signal", () => {
    const listener = vi.fn();
    target.addEventListener("click", listener, { signal: AbortSignal.abort() });
    click();

    expect(listener).not.toHaveBeenCalled();
    expect(countWrappedDomEventListeners(target)).toBe(0);
  });

  it("keeps a re-registered listener when an earlier signal aborts", () => {
    const listener = vi.fn();
    const first = new AbortController();
    target.addEventListener("click", listener, { signal: first.signal });
    target.removeEventListener("click", listener);
    target.addEventListener("click", listener, { signal: new AbortController().signal });
    first.abort();
    click();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(countWrappedDomEventListeners(target)).toBe(1);
  });

  describe("abort handler on the signal", () => {
    // A target whose native methods are spies, to observe what the wrapper registers on the signal.
    class SpiedTarget {}
    const nativeAdd = vi.fn();
    const nativeRemove = vi.fn();
    let spied: EventTarget;

    beforeAll(() => {
      Object.assign(SpiedTarget.prototype, { addEventListener: nativeAdd, removeEventListener: nativeRemove });
      wrapEventTarget(SpiedTarget as unknown as typeof EventTarget);
    });

    beforeEach(() => {
      nativeAdd.mockClear();
      nativeRemove.mockClear();
      spied = new SpiedTarget() as EventTarget;
    });

    function registered(type: string) {
      const index = nativeAdd.mock.calls.findIndex(([eventName]) => eventName === type);
      return { listener: nativeAdd.mock.calls[index]![1], target: nativeAdd.mock.contexts[index] };
    }

    function expectRemovedFromSignal(signal: AbortSignal, onAbort: unknown) {
      const index = nativeRemove.mock.calls.findIndex(([eventName]) => eventName === "abort");
      expect(nativeRemove.mock.calls[index]?.[1]).toBe(onAbort);
      expect(nativeRemove.mock.contexts[index]).toBe(signal);
    }

    it("is removed when the listener is removed explicitly", () => {
      const listener = vi.fn();
      const { signal } = new AbortController();
      spied.addEventListener("click", listener, { signal });
      const onAbort = registered("abort");
      expect(onAbort.target).toBe(signal);

      spied.removeEventListener("click", listener);

      expectRemovedFromSignal(signal, onAbort.listener);
    });

    it("is removed when a once listener has run", () => {
      const listener = vi.fn();
      const { signal } = new AbortController();
      spied.addEventListener("click", listener, { once: true, signal });
      const onAbort = registered("abort");

      // The browser invokes the wrapper, after removing it because of `once`.
      registered("click").listener(new Event("click"));

      expect(listener).toHaveBeenCalledTimes(1);
      expectRemovedFromSignal(signal, onAbort.listener);
    });

    it("is not added for a duplicate registration", () => {
      const listener = vi.fn();
      spied.addEventListener("click", listener, { signal: new AbortController().signal });
      nativeAdd.mockClear();

      spied.addEventListener("click", listener, { signal: new AbortController().signal });

      expect(nativeAdd.mock.calls.filter(([eventName]) => eventName === "abort")).toHaveLength(0);
    });
  });

  it("does not accumulate entries for once and signal listeners that never fire", () => {
    for (let i = 0; i < 1000; i++) {
      doc!.addEventListener("pointerup", () => {}, { once: true });
      const controller = new AbortController();
      doc!.addEventListener("keydown", () => {}, { signal: controller.signal });
      controller.abort();
    }

    // The never-fired once listeners are still registered with the browser, so they are still tracked.
    expect(countWrappedDomEventListeners(doc!)).toBe(1000);
    doc!.dispatchEvent(new Event("pointerup"));
    expect(countWrappedDomEventListeners(doc!)).toBe(0);
  });

  it("removes listeners registered without an explicit target", () => {
    // What a bare `addEventListener(...)` call in strict mode code amounts to: the patched method runs with an
    // undefined `this`, and the browser registers on the global object.
    const listener = vi.fn();
    EventTarget.prototype.addEventListener.call(undefined as unknown as EventTarget, "click", listener);
    EventTarget.prototype.removeEventListener.call(undefined as unknown as EventTarget, "click", listener);
    win!.dispatchEvent(new Event("click"));

    expect(listener).not.toHaveBeenCalled();
    expect(countWrappedDomEventListeners(win!)).toBe(0);
  });

  it("reports errors thrown by listeners", () => {
    const error = new Error("boom");
    target.addEventListener("click", () => {
      throw error;
    });
    // jsdom reports listener exceptions on the window instead of rethrowing them to dispatchEvent.
    const onError = (e: ErrorEvent) => e.preventDefault();
    win!.addEventListener("error", onError);
    click();
    win!.removeEventListener("error", onError);

    expect(reportUnhandledError).toHaveBeenCalledWith(error);
  });
});
