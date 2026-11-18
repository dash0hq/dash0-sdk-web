import { describe, expect, it } from "vitest";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { recorder } from "./session-recording";

// Expose V8's collector so the test can observe whether a stopped recorder is still reachable.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

// The SDK compiles against lib es2017, which predates WeakRef. Tests run on Node, where it exists.
declare class WeakRef<T extends object> {
  constructor(target: T);
  deref(): T | undefined;
}

describe("session recorder", () => {
  it("releases a recorder once it was stopped and a new one started", async () => {
    // The entrypoint must not import SDK modules, so the test cannot use the SSR-safe globals from utils either.
    // eslint-disable-next-line no-restricted-globals
    document.body.innerHTML = "<main><h1>Title</h1><p>Some <b>text</b></p><ul><li>a</li><li>b</li></ul></main>";

    // Recording follows document visibility, so the same page starts and stops the recorder many times. Each stopped
    // run must become garbage; anything it keeps reachable (its full snapshot included) is retained per tab switch.
    const firstRun = startAndStopRecording();
    startAndStopRecording();

    await collectGarbage();
    expect(firstRun.deref()).toBeUndefined();
  });
});

/**
 * Starts and stops a recording, returning a weak reference to its `emit` callback. The callback lives in the
 * recorder's closure, so it stays reachable for exactly as long as anything still references that run.
 */
function startAndStopRecording(): WeakRef<object> {
  const emit = () => {};
  const stop = recorder({ emit });
  expect(stop).toBeTypeOf("function");
  stop!();
  return new WeakRef(emit);
}

async function collectGarbage(): Promise<void> {
  // WeakRef targets are kept alive until the current job ends, so yield before collecting.
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }
}
