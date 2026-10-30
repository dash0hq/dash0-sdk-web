import { InstrumentationScope, KeyValue, Resource } from "./otlp";

/**
 * The trace returned by `Profiler.stop()` of the JS Self-Profiling API.
 * See https://wicg.github.io/js-self-profiling/#the-profilertrace-dictionary
 */
export type ProfilerTrace = {
  resources: string[];
  frames: ProfilerFrame[];
  stacks: ProfilerStack[];
  samples: ProfilerSample[];
};

export type ProfilerFrame = {
  name: string;
  resourceId?: number;
  line?: number;
  column?: number;
};

export type ProfilerStack = {
  parentId?: number;
  frameId: number;
};

export type ProfilerSample = {
  timestamp: number;
  stackId?: number;
};

export type ProfileChunk = {
  trace: ProfilerTrace;
  /** `performance.timeOrigin` of the document that recorded the trace. */
  timeOrigin: number;
  /** `performance.now()` when the profiler started and stopped. */
  startTime: number;
  endTime: number;
  /** The interval the profiler actually sampled at, which can be coarser than the requested one. */
  sampleIntervalMs: number;
  resource: Resource;
  scope: InstrumentationScope;
  attributes: KeyValue[];
  /** Debug ID of each script in `trace.resources` that has one, keyed by its URL. */
  debugIds?: Record<string, string>;
};

export type EncodedProfile = {
  body: Uint8Array;
  sampleCount: number;
  idleSampleCount: number;
};

/**
 * Turns a profiler trace into an OTLP `ExportProfilesServiceRequest`. Provided by the
 * `@dash0/sdk-web/profiling` entrypoint, so the main bundle does not carry the protobuf encoder.
 */
export type ProfileEncoder = (chunk: ProfileChunk) => EncodedProfile;

export type ProfilingSettings = {
  /** Percentage (0-100) of sampled sessions that are profiled, on top of `sessionSamplingRate`. Default 10. */
  sampleRate?: number;

  /** Requested sampling interval. Browsers may sample at a coarser interval. Default 10. */
  sampleIntervalMs?: number;

  /** How long the profiler runs before its trace is sent and a new one starts. Default 15000. */
  chunkDurationMs?: number;

  /**
   * The encoder exported by `@dash0/sdk-web/profiling`. Profiling only starts once an encoder is
   * provided, here or through the `dash0-profiling.iife.js` script loaded before `init()`.
   */
  encoder?: ProfileEncoder;
};
