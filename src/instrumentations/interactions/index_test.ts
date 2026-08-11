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
      captureScrolls: false,
      captureKeyPresses: false,
      captureChanges: false,
    };
  });

  it("starts only click instrumentation by default", () => {
    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
    expect(startScrollInstrumentation).not.toHaveBeenCalled();
    expect(startKeyPressInstrumentation).not.toHaveBeenCalled();
    expect(startChangeInstrumentation).not.toHaveBeenCalled();
  });

  it("starts scroll/key-press/change capture when opted in", () => {
    vars.interactionInstrumentation.captureScrolls = true;
    vars.interactionInstrumentation.captureKeyPresses = true;
    vars.interactionInstrumentation.captureChanges = true;

    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
    expect(startScrollInstrumentation).toHaveBeenCalledOnce();
    expect(startKeyPressInstrumentation).toHaveBeenCalledOnce();
    expect(startChangeInstrumentation).toHaveBeenCalledOnce();
  });

  it("does not start the extra capture types when the flags are absent", () => {
    vars.interactionInstrumentation = {
      enabled: true,
      actionNameAttribute: "data-dash0-action-name",
    };

    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
    expect(startScrollInstrumentation).not.toHaveBeenCalled();
    expect(startKeyPressInstrumentation).not.toHaveBeenCalled();
    expect(startChangeInstrumentation).not.toHaveBeenCalled();
  });
});
