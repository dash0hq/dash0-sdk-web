import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEncoder, ProfilerTrace } from "../../types/profiling";
import { doc, win } from "../../utils";

vi.mock("../../transport", () => ({ sendLog: vi.fn(), sendProfile: vi.fn() }));

const TRACE: ProfilerTrace = {
  resources: ["https://example.com/app.js?token=secret"],
  frames: [{ name: "work", resourceId: 0, line: 1, column: 1 }],
  stacks: [{ frameId: 0 }],
  samples: [{ timestamp: 1, stackId: 0 }],
};

class FakeProfiler {
  static instances: FakeProfiler[] = [];
  readonly sampleInterval = 16;
  stopped = false;
  constructor() {
    FakeProfiler.instances.push(this);
  }
  stop(): Promise<ProfilerTrace> {
    this.stopped = true;
    return Promise.resolve(TRACE);
  }
}

async function load() {
  vi.resetModules();
  const transport = await import("../../transport");
  const { vars } = await import("../../vars");
  const profiling = await import("./index");
  return { transport, vars, profiling };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(doc!, "visibilityState", { configurable: true, get: () => state });
  doc!.dispatchEvent(new Event("visibilitychange"));
}

describe("profiling", () => {
  const encoder = vi.fn<ProfileEncoder>(() => ({ body: "{}", sampleCount: 1 }));

  beforeEach(() => {
    vi.useFakeTimers();
    FakeProfiler.instances = [];
    encoder.mockClear();
    setVisibility("visible");
    (win as any).Profiler = FakeProfiler;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (win as any).Profiler;
    vi.clearAllMocks();
  });

  it("does nothing without an encoder", async () => {
    const { profiling, transport } = await load();
    profiling.startProfiling();
    expect(FakeProfiler.instances).toHaveLength(0);
    expect(transport.sendLog).not.toHaveBeenCalled();
  });

  it("reports once that the Profiler API is missing", async () => {
    delete (win as any).Profiler;
    const { profiling, transport, vars } = await load();
    vars.profiling = { ...vars.profiling, sampleRate: 100, encoder };

    profiling.startProfiling();
    setVisibility("hidden");
    setVisibility("visible");

    expect(transport.sendLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transport.sendLog).mock.calls[0]![0].body).toEqual({
      kvlistValue: { values: [{ key: "reason", value: { stringValue: "api_missing" } }] },
    });
  });

  it("reports a missing Document-Policy header", async () => {
    (win as any).Profiler = class {
      constructor() {
        throw new DOMException("js-profiling not allowed", "NotAllowedError");
      }
    };
    const { profiling, transport, vars } = await load();
    vars.profiling = { ...vars.profiling, sampleRate: 100, encoder };

    profiling.startProfiling();

    expect(vi.mocked(transport.sendLog).mock.calls[0]![0].body).toEqual({
      kvlistValue: { values: [{ key: "reason", value: { stringValue: "document_policy" } }] },
    });
  });

  it("rotates chunks and sends each one with session and page attributes", async () => {
    const { profiling, transport, vars } = await load();
    const session = await import("../../api/session");
    session.trackSessions();
    vars.profiling = { ...vars.profiling, sampleRate: 100, chunkDurationMs: 1000, encoder };
    vars.urlAttributeScrubber = (attrs) => ({ ...attrs, "url.query": attrs["url.query"] && "REDACTED" });

    profiling.startProfiling();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);

    expect(FakeProfiler.instances).toHaveLength(2);
    expect(FakeProfiler.instances[0]!.stopped).toBe(true);
    expect(transport.sendProfile).toHaveBeenCalledWith("{}", { compress: true });

    const chunk = encoder.mock.calls[0]![0];
    expect(chunk.profileId).toMatch(/^[0-9a-f]{32}$/);
    expect(chunk.sampleIntervalMs).toBe(16);
    expect(chunk.attributes).toEqual(
      expect.arrayContaining([
        { key: "session.id", value: { stringValue: session.sessionId } },
        { key: "page.url.full", value: { stringValue: win!.location.href } },
        { key: "page.url.path", value: { stringValue: win!.location.pathname } },
      ])
    );
    expect(chunk.trace.resources).toEqual(["https://example.com/app.js?REDACTED"]);
  });

  it("starts a new chunk on every page view, each with its own page url", async () => {
    const { profiling, vars } = await load();
    const navigation = await import("../navigation/event");
    vars.profiling = { ...vars.profiling, sampleRate: 100, chunkDurationMs: 1000, encoder };
    const pageUrl = (call: number) =>
      encoder.mock.calls[call]![0].attributes.find((a) => a.key === "page.url.full")?.value;

    profiling.startProfiling();
    navigation.transmitPageViewEvent("0", new URL("https://example.com/next"), true);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);

    expect(FakeProfiler.instances).toHaveLength(3);
    expect(pageUrl(0)).toEqual({ stringValue: win!.location.href });
    expect(pageUrl(1)).toEqual({ stringValue: "https://example.com/next" });
  });

  it("flushes uncompressed when hidden and resumes when visible", async () => {
    const { profiling, transport, vars } = await load();
    // Modules loaded by earlier tests keep their document listeners, so only this test's body counts.
    const body = '{"chunk":42}';
    const ownEncoder = vi.fn<ProfileEncoder>(() => ({ body, sampleCount: 1 }));
    vars.profiling = { ...vars.profiling, sampleRate: 100, chunkDurationMs: 1000, encoder: ownEncoder };
    const sent = () =>
      vi
        .mocked(transport.sendProfile)
        .mock.calls.filter(([b]) => b === body)
        .map(([, o]) => o);

    profiling.startProfiling();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(sent()).toEqual([{ compress: false }]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent()).toHaveLength(1);

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent()).toEqual([{ compress: false }, { compress: true }]);
  });

  it("does not profile sessions outside the profiling sample rate", async () => {
    const { profiling, vars } = await load();
    vars.profiling = { ...vars.profiling, sampleRate: 0, encoder };

    profiling.startProfiling();

    expect(FakeProfiler.instances).toHaveLength(0);
  });

  describe("with requestIdleCallback", () => {
    let idleCallbacks: { run: () => void; timeout: number }[];

    beforeEach(() => {
      idleCallbacks = [];
      (win as any).requestIdleCallback = (run: () => void, opts: { timeout: number }) =>
        idleCallbacks.push({ run, timeout: opts.timeout });
    });

    afterEach(() => {
      delete (win as any).requestIdleCallback;
    });

    it("encodes a rotated chunk in idle time, with a timeout", async () => {
      const { profiling, vars } = await load();
      vars.profiling = { ...vars.profiling, sampleRate: 100, chunkDurationMs: 1000, encoder };

      profiling.startProfiling();
      await vi.advanceTimersByTimeAsync(1000);
      expect(encoder).not.toHaveBeenCalled();
      expect(idleCallbacks.map((c) => c.timeout)).toEqual([2000]);

      idleCallbacks[0]!.run();
      expect(encoder).toHaveBeenCalledTimes(1);
    });

    it("sends a chunk still waiting for idle time on the last chance, once", async () => {
      const { profiling, transport, vars } = await load();
      const body = '{"chunk":7}';
      const ownEncoder = vi.fn<ProfileEncoder>(() => ({ body, sampleCount: 1 }));
      vars.profiling = { ...vars.profiling, sampleRate: 100, chunkDurationMs: 1000, encoder: ownEncoder };
      const sent = () =>
        vi
          .mocked(transport.sendProfile)
          .mock.calls.filter(([b]) => b === body)
          .map(([, o]) => o);

      profiling.startProfiling();
      await vi.advanceTimersByTimeAsync(1000);
      expect(sent()).toEqual([]);

      setVisibility("hidden");
      expect(sent()).toEqual([{ compress: false }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()).toEqual([{ compress: false }, { compress: false }]);

      idleCallbacks[0]!.run();
      expect(sent()).toHaveLength(2);
    });
  });
});
