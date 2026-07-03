import { describe, expect, it, vi } from "vitest";

vi.mock("./click", () => ({
  startClickInstrumentation: vi.fn(),
}));

import { startInteractionInstrumentation } from "./index";
import { startClickInstrumentation } from "./click";

describe("startInteractionInstrumentation", () => {
  it("starts click instrumentation", () => {
    startInteractionInstrumentation();

    expect(startClickInstrumentation).toHaveBeenCalledOnce();
  });
});
