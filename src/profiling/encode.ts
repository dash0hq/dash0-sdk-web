import type { AnyValue as SdkAnyValue, InstrumentationScope as SdkScope, KeyValue as SdkKeyValue } from "../types/otlp";
import type { EncodedProfile, ProfileChunk, ProfilerTrace } from "../types/profiling";
import type { AnyValue, InstrumentationScope, KeyValue } from "./otlp/opentelemetry/proto/common/v1/common";
import type {
  FunctionMessage,
  KeyValueAndUnit,
  Location,
  Profile,
  Sample,
  Stack,
} from "./otlp/opentelemetry/proto/profiles/v1development/profiles";
import { ExportProfilesServiceRequest } from "./otlp/opentelemetry/proto/collector/profiles/v1development/profiles_service";

export const FRAME_TYPE_ATTRIBUTE = "profile.frame.type";
export const FRAME_TYPE_V8JS = "v8js";
export const IDLE_SAMPLE_COUNT_ATTRIBUTE = "dash0.profiling.idle_sample_count";
// One of the build ID keys the Dash0 collector reads from a mapping; v8js frames with a UUID there get source maps.
export const BUILD_ID_ATTRIBUTE = "process.executable.build_id.htlhash";
const ANONYMOUS_FUNCTION = "(anonymous)";
const NANOS_PER_MILLI = 1_000_000;

export function encodeProfile(chunk: ProfileChunk): EncodedProfile {
  const { request, sampleCount, idleSampleCount } = toExportRequest(chunk);
  return { body: ExportProfilesServiceRequest.encode(request).finish(), sampleCount, idleSampleCount };
}

// Samples carry timestamps only, which the spec counts as one occurrence each. Samples without a
// stack were taken while no JavaScript ran: they are counted, not sent.
export function toExportRequest(chunk: ProfileChunk): {
  request: ExportProfilesServiceRequest;
  sampleCount: number;
  idleSampleCount: number;
} {
  const dict = newDictionary();
  const { trace, timeOrigin } = chunk;

  const frameTypeAttribute = dict.attribute(FRAME_TYPE_ATTRIBUTE, { stringValue: FRAME_TYPE_V8JS });
  const locationOfFrame = (frameId: number): number => {
    const frame = trace.frames[frameId];
    if (!frame) return 0;
    const resource = resourceOf(trace, frame.resourceId);
    const debugId = chunk.debugIds?.[resource];
    return dict.location(
      dict.func(frame.name || ANONYMOUS_FUNCTION, resource),
      frame.line ?? 0,
      frame.column ?? 0,
      frameTypeAttribute,
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
      grouped = { stackIndex, attributeIndices: [], linkIndex: 0, values: [], timestampsUnixNano: [] };
      samplesByStack.set(stackIndex, grouped);
    }
    grouped.timestampsUnixNano.push(toUnixNanos(timeOrigin, sample.timestamp));
  }

  const attributeIndices = chunk.attributes.map((kv) => dict.attribute(kv.key, toProtoValue(kv.value)));
  attributeIndices.push(dict.attribute(IDLE_SAMPLE_COUNT_ATTRIBUTE, { intValue: BigInt(idleSampleCount) }));

  const profile: Profile = {
    sampleType: { typeStrindex: dict.string("samples"), unitStrindex: dict.string("count") },
    samples: [...samplesByStack.values()],
    timeUnixNano: toUnixNanos(timeOrigin, chunk.startTime),
    durationNano: BigInt(Math.max(0, Math.round((chunk.endTime - chunk.startTime) * NANOS_PER_MILLI))),
    periodType: { typeStrindex: dict.string("cpu"), unitStrindex: dict.string("nanoseconds") },
    period: BigInt(Math.round(chunk.sampleIntervalMs * NANOS_PER_MILLI)),
    profileId: randomBytes(16),
    droppedAttributesCount: 0,
    originalPayloadFormat: "",
    originalPayload: new Uint8Array(0),
    attributeIndices,
  };

  return {
    request: {
      resourceProfiles: [
        {
          resource: {
            attributes: chunk.resource.attributes.map(toProtoKeyValue),
            droppedAttributesCount: 0,
            entityRefs: [],
          },
          scopeProfiles: [{ scope: toProtoScope(chunk.scope), profiles: [profile], schemaUrl: "" }],
          schemaUrl: "",
        },
      ],
      dictionary: dict.tables,
    },
    sampleCount: trace.samples.length - idleSampleCount,
    idleSampleCount,
  };
}

function newDictionary() {
  // Index 0 of every table must be present and hold the zero value; index 0 means "unset".
  const tables = {
    mappingTable: [{ memoryStart: 0n, memoryLimit: 0n, fileOffset: 0n, filenameStrindex: 0, attributeIndices: [] }],
    locationTable: [{ mappingIndex: 0, address: 0n, lines: [], attributeIndices: [] }] as Location[],
    functionTable: [
      { nameStrindex: 0, systemNameStrindex: 0, filenameStrindex: 0, startLine: 0n },
    ] as FunctionMessage[],
    linkTable: [{ traceId: new Uint8Array(16), spanId: new Uint8Array(8) }],
    stringTable: [""],
    attributeTable: [{ keyStrindex: 0, value: undefined, unitStrindex: 0 }] as KeyValueAndUnit[],
    stackTable: [{ locationIndices: [] }] as Stack[],
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
        systemNameStrindex: 0,
        filenameStrindex,
        startLine: 0n,
      }));
    },
    mapping: (file: string, buildIdAttributeIndex: number): number => {
      const filenameStrindex = dict.string(file);
      return intern(tables.mappingTable, `m${filenameStrindex}:${buildIdAttributeIndex}`, () => ({
        memoryStart: 0n,
        memoryLimit: 0n,
        fileOffset: 0n,
        filenameStrindex,
        attributeIndices: [buildIdAttributeIndex],
      }));
    },
    location: (
      functionIndex: number,
      line: number,
      column: number,
      attributeIndex: number,
      mappingIndex: number
    ): number =>
      intern(tables.locationTable, `l${functionIndex}:${line}:${column}:${mappingIndex}`, () => ({
        mappingIndex,
        address: 0n,
        lines: [{ functionIndex, line: BigInt(line), column: BigInt(column) }],
        attributeIndices: [attributeIndex],
      })),
    stack: (locationIndices: number[]): number =>
      intern(tables.stackTable, "k" + locationIndices.join(","), () => ({ locationIndices })),
    attribute: (key: string, value: AnyValue): number => {
      const keyStrindex = dict.string(key);
      return intern(tables.attributeTable, `a${keyStrindex}:${valueKey(value)}`, () => ({
        keyStrindex,
        value,
        unitStrindex: 0,
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

function toUnixNanos(timeOrigin: number, relativeMillis: number): bigint {
  // timeOrigin * 1e6 is past 2^53, so the whole milliseconds are scaled as a bigint.
  const wholeMillis = Math.floor(timeOrigin);
  const fraction = timeOrigin - wholeMillis + relativeMillis;
  return BigInt(wholeMillis) * BigInt(NANOS_PER_MILLI) + BigInt(Math.round(fraction * NANOS_PER_MILLI));
}

function valueKey(value: AnyValue): string {
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() + "n" : v));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toProtoScope(scope: SdkScope): InstrumentationScope {
  return {
    name: scope.name ?? "",
    version: scope.version ?? "",
    attributes: (scope.attributes ?? []).map(toProtoKeyValue),
    droppedAttributesCount: 0,
  };
}

function toProtoKeyValue(kv: SdkKeyValue): KeyValue {
  return { key: kv.key, value: toProtoValue(kv.value), keyStrindex: 0 };
}

function toProtoValue(value: SdkAnyValue | undefined): AnyValue {
  if (!value) return {};
  if (value.stringValue != null) return { stringValue: value.stringValue };
  if (value.boolValue != null) return { boolValue: value.boolValue };
  if (value.intValue != null) return { intValue: BigInt(value.intValue) };
  if (value.doubleValue != null) return { doubleValue: value.doubleValue };
  if (value.arrayValue) return { arrayValue: { values: value.arrayValue.values.map(toProtoValue) } };
  if (value.kvlistValue) return { kvlistValue: { values: value.kvlistValue.values.map(toProtoKeyValue) } };
  return {};
}
