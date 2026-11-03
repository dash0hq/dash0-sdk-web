import { describe, expect, it } from "vitest";
import {
  BURST_SAMPLE_COUNT_ATTRIBUTE,
  encodeProfiles,
  FRAME_TYPE_ATTRIBUTE,
  IDLE_SAMPLE_COUNT_ATTRIBUTE,
} from "./encode";
import type { ProfileChunk, ProfilerTrace } from "../types/profiling";

const APP_JS = "https://example.com/app.js";

const trace: ProfilerTrace = {
  resources: [APP_JS, "https://cdn.example.com/lib.js"],
  frames: [
    { name: "main", resourceId: 0, line: 1, column: 1 },
    { name: "work", resourceId: 0, line: 10, column: 5 },
    // A second frame identical to frame 1, so its stacks must collapse onto the same entries.
    { name: "work", resourceId: 0, line: 10, column: 5 },
    { name: "", resourceId: 1, line: 3, column: 7 },
    { name: "never-sampled", resourceId: 1 },
  ],
  stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }, { frameId: 2, parentId: 0 }, { frameId: 3, parentId: 1 }],
  samples: [
    { timestamp: 100, stackId: 1 },
    { timestamp: 110, stackId: 2 },
    { timestamp: 120 },
    { timestamp: 130, stackId: 3 },
    { timestamp: 140 },
    { timestamp: 150.5, stackId: 0 },
  ],
};

const chunk: ProfileChunk = {
  profileId: "0123456789abcdef0123456789abcdef",
  trace,
  timeOrigin: 1761822000123.25,
  startTime: 95,
  endTime: 160,
  sampleIntervalMs: 10,
  resource: { attributes: [{ key: "service.name", value: { stringValue: "website" } }] },
  scope: { name: "dash0-web-sdk", version: "1.2.3", attributes: [] },
  attributes: [
    { key: "session.id", value: { stringValue: "abc" } },
    { key: "page.url.full", value: { stringValue: "https://example.com/" } },
  ],
};

function decode(input: ProfileChunk = chunk) {
  const encoded = encodeProfiles([input]);
  const request = JSON.parse(encoded.body);
  const dict = request.dictionary!;
  const profile = request.resourceProfiles[0]!.scopeProfiles[0]!.profiles[0]!;
  const str = (i: number) => dict.stringTable[i];
  const functionNames = (stackIndex: number) =>
    dict.stackTable[stackIndex]!.locationIndices.map((l: number) => {
      const line = dict.locationTable[l]!.lines[0]!;
      return str(dict.functionTable[line.functionIndex]!.nameStrindex);
    });
  const attribute = (i: number) => {
    const a = dict.attributeTable[i]!;
    return [str(a.keyStrindex), a.value];
  };
  return { encoded, request, dict, profile, str, functionNames, attribute };
}

describe("encodeProfiles", () => {
  it("keeps the zero value at index 0 of every dictionary table", () => {
    const { dict } = decode();
    expect(dict.stringTable[0]).toBe("");
    for (const table of [
      dict.mappingTable,
      dict.locationTable,
      dict.functionTable,
      dict.linkTable,
      dict.attributeTable,
      dict.stackTable,
    ]) {
      expect(table[0]).toEqual({});
    }
    expect(dict.mappingTable).toHaveLength(1);
    expect(dict.linkTable).toHaveLength(1);
  });

  it("deduplicates identical frames, stacks and strings", () => {
    const { dict, profile, functionNames, str } = decode();

    // main, work, (anonymous); "never-sampled" is not referenced by any sample.
    expect(dict.functionTable).toHaveLength(4);
    expect(dict.locationTable).toHaveLength(4);
    // [main], [work, main], [(anonymous), work, main]: stacks 1 and 2 collapse into one.
    expect(dict.stackTable).toHaveLength(4);
    expect(new Set(dict.stringTable).size).toBe(dict.stringTable.length);
    expect(dict.stringTable).not.toContain("never-sampled");

    expect(profile.samples.map((s: any) => functionNames(s.stackIndex))).toEqual([
      ["work", "main"],
      ["(anonymous)", "work", "main"],
      ["main"],
    ]);
    expect(profile.samples[0]!.timestampsUnixNano).toHaveLength(2);
    expect(str(dict.functionTable[1]!.filenameStrindex)).toBe(APP_JS);
  });

  it("keeps line and column and marks every location as a v8js frame", () => {
    const { dict, attribute } = decode();
    const work = dict.locationTable.find((l: any) => l.lines?.[0]?.line === "10")!;
    expect(work.lines[0]!.column).toBe("5");
    for (const location of dict.locationTable.slice(1)) {
      expect(location.attributeIndices.map(attribute)).toEqual([[FRAME_TYPE_ATTRIBUTE, { stringValue: "v8js" }]]);
    }
  });

  it("converts sample timestamps to absolute unix nanoseconds", () => {
    const { profile } = decode();
    // timeOrigin 1761822000123.25 ms + 100 ms, and + 150.5 ms
    expect(profile.samples[0]!.timestampsUnixNano[0]).toBe("1761822000223250000");
    expect(profile.samples[2]!.timestampsUnixNano[0]).toBe("1761822000273750000");
    expect(profile.timeUnixNano).toBe("1761822000218250000");
    expect(profile.durationNano).toBe("65000000");
    expect(profile.period).toBe("10000000");
  });

  it("counts samples without a stack as idle and does not send them", () => {
    const { encoded, profile, attribute } = decode();
    const sent = profile.samples.reduce((n: number, s: any) => n + s.timestampsUnixNano.length, 0);
    expect(sent).toBe(4);
    expect(encoded.sampleCount).toBe(4);
    expect(profile.attributeIndices.map(attribute)).toContainEqual([IDLE_SAMPLE_COUNT_ATTRIBUTE, { intValue: "2" }]);
  });

  it("keeps one sample per half interval and counts the rest as burst samples", () => {
    const burst: ProfilerTrace = {
      ...trace,
      samples: [
        { timestamp: 100, stackId: 3 },
        { timestamp: 100.1, stackId: 1 },
        { timestamp: 100.1, stackId: 0 },
        { timestamp: 104, stackId: 1 },
        { timestamp: 110, stackId: 2 },
        { timestamp: 110.2 },
        { timestamp: 120, stackId: 0 },
      ],
    };
    const { encoded, profile, attribute, functionNames } = decode({ ...chunk, trace: burst });
    expect(encoded.sampleCount).toBe(3);
    expect(profile.samples.map((s: any) => functionNames(s.stackIndex))).toEqual([
      ["(anonymous)", "work", "main"],
      ["work", "main"],
      ["main"],
    ]);
    expect(profile.attributeIndices.map(attribute)).toContainEqual([BURST_SAMPLE_COUNT_ATTRIBUTE, { intValue: "4" }]);
  });

  it("uses the given resource, scope and signal attributes", () => {
    const { request, profile, attribute, str } = decode();
    const resourceProfiles = request.resourceProfiles[0]!;
    expect(resourceProfiles.resource!.attributes).toEqual([{ key: "service.name", value: { stringValue: "website" } }]);
    expect(resourceProfiles.scopeProfiles[0]!.scope).toMatchObject({ name: "dash0-web-sdk", version: "1.2.3" });
    expect(profile.attributeIndices.map(attribute)).toEqual(
      expect.arrayContaining([
        ["session.id", { stringValue: "abc" }],
        ["page.url.full", { stringValue: "https://example.com/" }],
      ])
    );
    expect([str(profile.sampleType!.typeStrindex), str(profile.sampleType!.unitStrindex)]).toEqual([
      "samples",
      "count",
    ]);
    expect([str(profile.periodType!.typeStrindex), str(profile.periodType!.unitStrindex)]).toEqual([
      "cpu",
      "nanoseconds",
    ]);
  });
});
