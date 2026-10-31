import type { AnyValue, ExportProfilesServiceRequest, Profile, ProfilesDictionary, Sample } from "../types/otlp";
import type { EncodedProfile, ProfileChunk, ProfilerTrace } from "../types/profiling";

export const FRAME_TYPE_ATTRIBUTE = "profile.frame.type";
const FRAME_TYPE_V8JS = "v8js";
export const IDLE_SAMPLE_COUNT_ATTRIBUTE = "dash0.profiling.idle_sample_count";
// One of the build ID keys the Dash0 collector reads from a mapping; v8js frames with a UUID there get source maps.
export const BUILD_ID_ATTRIBUTE = "process.executable.build_id.htlhash";
const ANONYMOUS_FUNCTION = "(anonymous)";
const NANOS_PER_MILLI = 1_000_000;

// Samples carry timestamps only, which the spec counts as one occurrence each. Samples without a
// stack were taken while no JavaScript ran: they are counted, not sent.
export function encodeProfile(chunk: ProfileChunk): EncodedProfile {
  const dict = newDictionary();
  const { trace } = chunk;
  const unixNanos = unixNanosSince(chunk.timeOrigin);

  const locationByFrame = new Map<number, number>();
  const locationOfFrame = (frameId: number): number => {
    let location = locationByFrame.get(frameId);
    if (location === undefined) {
      location = newLocation(frameId);
      locationByFrame.set(frameId, location);
    }
    return location;
  };
  const newLocation = (frameId: number): number => {
    const frame = trace.frames[frameId];
    if (!frame) return 0;
    const resource = resourceOf(trace, frame.resourceId);
    const debugId = chunk.debugIds?.[resource];
    return dict.location(
      dict.func(frame.name || ANONYMOUS_FUNCTION, resource),
      frame.line ?? 0,
      frame.column ?? 0,
      debugId ? dict.mapping(resource, dict.attribute(BUILD_ID_ATTRIBUTE, { stringValue: debugId })) : 0
    );
  };

  const stackOfTraceStack = new Map<number, number>();
  const samplesByStack = new Map<number, Sample>();
  let idleSampleCount = 0;

  for (const sample of trace.samples) {
    if (sample.stackId == null) {
      idleSampleCount++;
      continue;
    }

    let stackIndex = stackOfTraceStack.get(sample.stackId);
    if (stackIndex === undefined) {
      stackIndex = dict.stack(leafFirstLocations(trace, sample.stackId, locationOfFrame));
      stackOfTraceStack.set(sample.stackId, stackIndex);
    }

    let grouped = samplesByStack.get(stackIndex);
    if (!grouped) {
      grouped = { stackIndex, timestampsUnixNano: [] };
      samplesByStack.set(stackIndex, grouped);
    }
    grouped.timestampsUnixNano.push(unixNanos(sample.timestamp));
  }

  const attributeIndices = chunk.attributes.map((kv) => dict.attribute(kv.key, kv.value));
  attributeIndices.push(dict.attribute(IDLE_SAMPLE_COUNT_ATTRIBUTE, { intValue: String(idleSampleCount) }));

  const profile: Profile = {
    sampleType: { typeStrindex: dict.string("samples"), unitStrindex: dict.string("count") },
    samples: [...samplesByStack.values()],
    timeUnixNano: unixNanos(chunk.startTime),
    durationNano: String(Math.max(0, Math.round((chunk.endTime - chunk.startTime) * NANOS_PER_MILLI))),
    periodType: { typeStrindex: dict.string("cpu"), unitStrindex: dict.string("nanoseconds") },
    period: String(Math.round(chunk.sampleIntervalMs * NANOS_PER_MILLI)),
    profileId: chunk.profileId,
    attributeIndices,
  };

  const request: ExportProfilesServiceRequest = {
    resourceProfiles: [{ resource: chunk.resource, scopeProfiles: [{ scope: chunk.scope, profiles: [profile] }] }],
    dictionary: dict.tables,
  };
  return { body: JSON.stringify(request), sampleCount: trace.samples.length - idleSampleCount };
}

function newDictionary() {
  // Index 0 of every table must be present and hold the zero value; index 0 means "unset".
  const tables: ProfilesDictionary = {
    mappingTable: [{}],
    locationTable: [{}],
    functionTable: [{}],
    linkTable: [{}],
    stringTable: [""],
    attributeTable: [{}],
    stackTable: [{}],
  };
  const indexes = new Map<string, number>();

  function intern<T>(table: T[], key: string, create: () => T): number {
    let index = indexes.get(key);
    if (index === undefined) {
      index = table.push(create()) - 1;
      indexes.set(key, index);
    }
    return index;
  }

  const dict = {
    tables,
    string: (s: string): number => (s === "" ? 0 : intern(tables.stringTable, "s" + s, () => s)),
    func: (name: string, file: string): number => {
      const nameStrindex = dict.string(name);
      const filenameStrindex = dict.string(file);
      return intern(tables.functionTable, `f${nameStrindex}:${filenameStrindex}`, () => ({
        nameStrindex,
        filenameStrindex,
      }));
    },
    mapping: (file: string, buildIdAttributeIndex: number): number => {
      const filenameStrindex = dict.string(file);
      return intern(tables.mappingTable, `m${filenameStrindex}:${buildIdAttributeIndex}`, () => ({
        filenameStrindex,
        attributeIndices: [buildIdAttributeIndex],
      }));
    },
    location: (functionIndex: number, line: number, column: number, mappingIndex: number): number =>
      intern(tables.locationTable, `l${functionIndex}:${line}:${column}:${mappingIndex}`, () => ({
        mappingIndex,
        lines: [{ functionIndex, line: String(line), column: String(column) }],
        attributeIndices: [dict.attribute(FRAME_TYPE_ATTRIBUTE, { stringValue: FRAME_TYPE_V8JS })],
      })),
    stack: (locationIndices: number[]): number =>
      intern(tables.stackTable, "k" + locationIndices.join(","), () => ({ locationIndices })),
    attribute: (key: string, value: AnyValue): number => {
      const keyStrindex = dict.string(key);
      return intern(tables.attributeTable, `a${keyStrindex}:${JSON.stringify(value)}`, () => ({
        keyStrindex,
        value,
      }));
    },
  };
  return dict;
}

function leafFirstLocations(
  trace: ProfilerTrace,
  stackId: number,
  locationOfFrame: (frameId: number) => number
): number[] {
  const locations: number[] = [];
  let id: number | undefined = stackId;
  while (id != null) {
    const stack: ProfilerTrace["stacks"][number] | undefined = trace.stacks[id];
    if (!stack) break;
    locations.push(locationOfFrame(stack.frameId));
    id = stack.parentId;
  }
  return locations;
}

function resourceOf(trace: ProfilerTrace, resourceId: number | undefined): string {
  return resourceId == null ? "" : (trace.resources[resourceId] ?? "");
}

function unixNanosSince(timeOrigin: number): (relativeMillis: number) => string {
  // timeOrigin * 1e6 is past 2^53, so the whole milliseconds are scaled as a bigint.
  const wholeMillis = Math.floor(timeOrigin);
  const fraction = timeOrigin - wholeMillis;
  const base = BigInt(wholeMillis) * BigInt(NANOS_PER_MILLI);
  return (relativeMillis) => String(base + BigInt(Math.round((fraction + relativeMillis) * NANOS_PER_MILLI)));
}
