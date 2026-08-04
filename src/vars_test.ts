import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS, vars } from "./vars";
import { MAX_TRANSPORT_CALLS_PER_TEN_SECONDS } from "./transport/limits";

describe("vars defaults", () => {
  it("defaults interactionInstrumentation to disabled with the standard action-name attribute", () => {
    expect(vars.interactionInstrumentation).toEqual({
      enabled: false,
      actionNameAttribute: "data-dash0-action-name",
      captureScrolls: false,
      captureKeyPresses: false,
      captureChanges: false,
      maxEventsPerTenSeconds: DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS,
    });
  });

  it("leaves the majority of the transport budget to the other signals", () => {
    // A default that met or exceeded the transport ceiling would let interaction
    // volume evict spans, errors, page views and web vitals.
    expect(DEFAULT_MAX_INTERACTION_EVENTS_PER_TEN_SECONDS).toBeLessThan(MAX_TRANSPORT_CALLS_PER_TEN_SECONDS / 2);
  });
});
