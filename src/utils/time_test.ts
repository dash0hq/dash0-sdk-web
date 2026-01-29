import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";
import { now, nowNanos, toNanosTs, getTimeOrigin, domHRTimestampToNanos } from "./time";
import * as globals from "./globals";

describe("now", () => {
  it("returns the current time in milliseconds", () => {
    const before = new Date().getTime();
    const result = now();
    const after = new Date().getTime();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe("toNanosTs", () => {
  it("converts milliseconds to nanoseconds as string", () => {
    const ms = 1609459200000; // 2021-01-01 00:00:00 UTC
    const result = toNanosTs(ms);
    expect(result).toBe("1609459200000000000");
  });

  it("converts Date object to nanoseconds as string", () => {
    const date = new Date(1609459200000);
    const result = toNanosTs(date);
    expect(result).toBe("1609459200000000000");
  });

  it("handles zero timestamp", () => {
    const result = toNanosTs(0);
    expect(result).toBe("0000000");
  });

  it("preserves precision", () => {
    const ms = 1234567890123;
    const result = toNanosTs(ms);
    expect(result).toBe("1234567890123000000");
  });
});

describe("getTimeOrigin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns timeOrigin when available", () => {
    const mockPerf = {
      timeOrigin: 1609459200000,
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = getTimeOrigin();
    expect(result).toBe(1609459200000);
  });

  it("falls back to timing.fetchStart when timeOrigin is not a number", () => {
    const mockPerf = {
      timing: {
        fetchStart: 1609459200000,
      },
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = getTimeOrigin();
    expect(result).toBe(1609459200000);
  });

  it("returns undefined when perf is not available", () => {
    vi.spyOn(globals, "perf", "get").mockReturnValue(undefined);

    const result = getTimeOrigin();
    expect(result).toBeUndefined();
  });

  it("returns undefined when both timeOrigin and fetchStart are unavailable", () => {
    const mockPerf = {
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = getTimeOrigin();
    expect(result).toBeUndefined();
  });
});

describe("nowNanos", () => {
  let dateNowSpy: any;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date.prototype, "getTime");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses performance time when available and not drifted", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000; // 5 seconds after time origin
    const expectedTime = timeOrigin + perfNow; // 1609459205000

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(expectedTime);

    const result = nowNanos();
    const expected = String(expectedTime * 1000000);
    expect(result).toBe(expected);
  });

  it("falls back to Date when drift is exactly 60000ms (60 seconds)", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000;
    const perfTime = timeOrigin + perfNow; // 1609459205000
    const dateTime = perfTime + 60000; // 60000ms drift

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(dateTime) + "000000";
    expect(result).toBe(expected);
  });

  it("falls back to Date when drift exceeds 60000ms (positive)", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000;
    const perfTime = timeOrigin + perfNow;
    const dateTime = perfTime + 65000; // 65000ms drift (browser slept)

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(dateTime) + "000000";
    expect(result).toBe(expected);
  });

  it("falls back to Date when drift exceeds 60000ms (negative)", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000;
    const perfTime = timeOrigin + perfNow;
    const dateTime = perfTime - 65000; // -65000ms drift (clock adjustment)

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(dateTime) + "000000";
    expect(result).toBe(expected);
  });

  it("uses performance time when drift is just under 60000ms (59999ms)", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000;
    const perfTime = timeOrigin + perfNow;
    const dateTime = perfTime + 59999; // 59999ms drift (still acceptable)

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(perfTime * 1000000);
    expect(result).toBe(expected);
  });

  it("uses performance time when drift is just under -60000ms (-59999ms)", () => {
    const timeOrigin = 1609459200000;
    const perfNow = 5000;
    const perfTime = timeOrigin + perfNow;
    const dateTime = perfTime - 59999; // -59999ms drift (still acceptable)

    const mockPerf = {
      timeOrigin,
      now: vi.fn().mockReturnValue(perfNow),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(perfTime * 1000000);
    expect(result).toBe(expected);
  });

  it("falls back to Date when timeOrigin is not available", () => {
    vi.spyOn(globals, "perf", "get").mockReturnValue(undefined);
    const dateTime = 1609459205000;
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(dateTime) + "000000";
    expect(result).toBe(expected);
  });

  it("falls back to Date when timeOrigin is not a number", () => {
    const mockPerf = {
      timeOrigin: undefined,
      now: vi.fn().mockReturnValue(5000),
      timing: {}, // no fetchStart either
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);
    const dateTime = 1609459205000;
    dateNowSpy.mockReturnValue(dateTime);

    const result = nowNanos();
    const expected = String(dateTime) + "000000";
    expect(result).toBe(expected);
  });
});

describe("domHRTimestampToNanos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts DOM high resolution timestamp to nanoseconds", () => {
    const timeOrigin = 1609459200000;
    const hrTimestamp = 5000.123; // 5.000123 seconds after time origin

    const mockPerf = {
      timeOrigin,
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = domHRTimestampToNanos(hrTimestamp);
    const expectedMs = timeOrigin + hrTimestamp;
    const expectedNanos = String(Math.round(expectedMs * 1000000));
    expect(result).toBe(expectedNanos);
  });

  it("rounds to nearest nanosecond", () => {
    const timeOrigin = 1000;
    const hrTimestamp = 0.0000001; // Very small fraction

    const mockPerf = {
      timeOrigin,
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = domHRTimestampToNanos(hrTimestamp);
    const expectedMs = timeOrigin + hrTimestamp;
    const expectedNanos = String(Math.round(expectedMs * 1000000));
    expect(result).toBe(expectedNanos);
  });

  it("handles zero timestamp", () => {
    const timeOrigin = 1609459200000;

    const mockPerf = {
      timeOrigin,
      now: vi.fn(),
    };
    vi.spyOn(globals, "perf", "get").mockReturnValue(mockPerf as any);

    const result = domHRTimestampToNanos(0);
    const expectedNanos = String(Math.round(timeOrigin * 1000000));
    expect(result).toBe(expectedNanos);
  });
});
