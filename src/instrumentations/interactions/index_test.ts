import { beforeEach, describe, expect, it, vi } from "vitest";
import { vars } from "../../vars";

vi.mock("./click", () => ({
  startClickInstrumentation: vi.fn(),
}));
vi.mock("./scroll", () => ({
  startScrollInstrumentation: vi.fn(),
}));
vi.mock("./keypress", () => ({
  startKeyPressInstrumentation: vi.fn(),
}));
vi.mock("./change", () => ({
  startChangeInstrumentation: vi.fn(),
}));

import { startInteractionInstrumentation } from "./index";
import { startClickInstrumentation } from "./click";
import { startScrollInstrumentation } from "./scroll";
import { startKeyPressInstrumentation } from "./keypress";
import { startChangeInstrumentation } from "./change";

describe("startInteractionInstrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vars.interactionInstrumentation = {
      enabled: true,
      actionNameAttribute: "data-dash0-action-name",
      captureScrolls: true,
      captureKeyPresses: true,
      captureChanges: true,
    };
  });

  it("starts all four interaction instrumentations by default", () => {
    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
    expect(startScrollInstrumentation).toHaveBeenCalledOnce();
    expect(startKeyPressInstrumentation).toHaveBeenCalledOnce();
    expect(startChangeInstrumentation).toHaveBeenCalledOnce();
  });

  it("honors the capture* opt-outs while clicks stay on", () => {
    vars.interactionInstrumentation.captureScrolls = false;
    vars.interactionInstrumentation.captureKeyPresses = false;
    vars.interactionInstrumentation.captureChanges = false;

    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
    expect(startScrollInstrumentation).not.toHaveBeenCalled();
    expect(startKeyPressInstrumentation).not.toHaveBeenCalled();
    expect(startChangeInstrumentation).not.toHaveBeenCalled();
  });
});
