import { describe, expect, it } from "vitest";
import * as npmPackage from "./npm-package";

describe("npm-package entrypoint", () => {
  it("exports startView", () => {
    expect(typeof npmPackage.startView).toBe("function");
  });
});
