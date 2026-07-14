import { describe, expect, it } from "vitest";
import { vars } from "./vars";

describe("vars defaults", () => {
  it("defaults interactionInstrumentation to disabled with the standard action-name attribute", () => {
    expect(vars.interactionInstrumentation).toEqual({
      enabled: false,
      actionNameAttribute: "data-dash0-action-name",
      captureScrolls: true,
      captureKeyPresses: true,
      captureChanges: true,
    });
  });
});
