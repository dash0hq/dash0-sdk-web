import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InitOptions, InstrumentationName } from "../types/options";
import { PropagatorConfig, Vars } from "../vars";
import { init as initFun } from "./init";

// Mock all the instrumentation modules
vi.mock("../instrumentations/web-vitals", () => ({
  startWebVitalsInstrumentation: vi.fn(),
}));

vi.mock("../instrumentations/errors", () => ({
  startErrorInstrumentation: vi.fn(),
}));

vi.mock("../instrumentations/http/fetch", () => ({
  instrumentFetch: vi.fn(),
}));

vi.mock("../instrumentations/navigation", () => ({
  startNavigationInstrumentation: vi.fn(),
}));

import { startErrorInstrumentation } from "../instrumentations/errors";
import { instrumentFetch } from "../instrumentations/http/fetch";
import { startNavigationInstrumentation } from "../instrumentations/navigation";
import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";

describe("init", () => {
  const baseOptions: InitOptions = {
    serviceName: "test-service",
    endpoint: { url: "https://test-endpoint.com", authToken: "invalid" },
  };
  let vars: Vars;
  let init: typeof initFun;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the hasBeenInitialised flag by re-importing the module
    vi.resetModules();
    // Reset vars state after module reset
    // since init itself needs vars, this needs to imported again as well.
    // Otherwise the tests that make assumptions on the vars fail because they use a different reference.
    const { vars: importedVars } = await import("../vars");
    const { init: importedInit } = await import("./init");
    vars = importedVars;
    init = importedInit;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("instrumentation enablement", () => {
    it("should enable all instrumentations when enabledInstrumentations is undefined", async () => {
      init({
        ...baseOptions,
        enabledInstrumentations: undefined,
      });

      expect(startNavigationInstrumentation).toHaveBeenCalled();
      expect(startWebVitalsInstrumentation).toHaveBeenCalled();
      expect(startErrorInstrumentation).toHaveBeenCalled();
      expect(instrumentFetch).toHaveBeenCalled();
    });

    const instrumentations: InstrumentationName[] = [
      "@dash0/navigation",
      "@dash0/web-vitals",
      "@dash0/error",
      "@dash0/fetch",
    ];
    const instrumentationMocks = {
      "@dash0/navigation": startNavigationInstrumentation,
      "@dash0/web-vitals": startWebVitalsInstrumentation,
      "@dash0/error": startErrorInstrumentation,
      "@dash0/fetch": instrumentFetch,
    };

    instrumentations.forEach((instrumentation) => {
      it(`should enable ${instrumentation} instrumentation when present in enabledInstrumentations array`, async () => {
        init({
          ...baseOptions,
          enabledInstrumentations: [instrumentation],
        });

        expect(instrumentationMocks[instrumentation]).toHaveBeenCalled();

        // Check that other instrumentations are not called
        Object.entries(instrumentationMocks).forEach(([name, mock]) => {
          if (name !== instrumentation) {
            expect(mock).not.toHaveBeenCalled();
          }
        });
      });

      it(`should not enable ${instrumentation} instrumentation when not present in enabledInstrumentations array`, async () => {
        const otherInstrumentations = instrumentations.filter((i) => i !== instrumentation);

        init({
          ...baseOptions,
          enabledInstrumentations: otherInstrumentations,
        });

        expect(instrumentationMocks[instrumentation]).not.toHaveBeenCalled();

        // Check that other instrumentations are called
        otherInstrumentations.forEach((name) => {
          expect(instrumentationMocks[name]).toHaveBeenCalled();
        });
      });
    });
  });

  describe("propagator configuration", () => {
    it("should set propagators configuration when provided", async () => {
      const propagators: PropagatorConfig[] = [
        { type: "traceparent" as const, match: [/.*\/api\/.*/] },
        { type: "xray" as const, match: [/.*\.amazonaws\.com.*/] },
      ];

      init({
        ...baseOptions,
        propagators,
      });

      expect(vars.propagators).toEqual(propagators);
    });

    it("should warn when both propagators and legacy config are provided", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");
      const propagators: PropagatorConfig[] = [{ type: "traceparent" as const, match: [/.*\/api\/.*/] }];

      init({
        ...baseOptions,
        propagators,
        propagateTraceHeadersCorsURLs: [/.*\.example\.com.*/],
      });

      expect(spyOnWarn).toHaveBeenCalledWith(
        "Both 'propagators' and deprecated 'propagateTraceHeadersCorsURLs' were provided. Using 'propagators' configuration. Please migrate to the new 'propagators' config."
      );
      expect(vars.propagators).toEqual(propagators);
    });

    it("should convert legacy config to new format with deprecation warning", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");
      const legacyConfig = [/.*\.example\.com.*/, /.*\.test\.com.*/];

      init({
        ...baseOptions,
        propagateTraceHeadersCorsURLs: legacyConfig,
      });

      expect(spyOnWarn).toHaveBeenCalledWith(
        "'propagateTraceHeadersCorsURLs' is deprecated. Please use the new 'propagators' configuration."
      );

      expect(vars.propagators).toEqual([
        {
          type: "traceparent",
          match: [...legacyConfig],
        },
      ]);
    });

    it("should set default propagators when no configuration is provided", async () => {
      init(baseOptions);

      expect(vars.propagators).toEqual([
        {
          type: "traceparent",
          match: [],
        },
      ]);
    });

    it("should not convert empty legacy config", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");

      init({
        ...baseOptions,
        propagateTraceHeadersCorsURLs: [],
      });

      expect(spyOnWarn).not.toHaveBeenCalled();
      expect(vars.propagators).toEqual([
        {
          type: "traceparent",
          match: [],
        },
      ]);
    });

    it("should handle mixed pattern types in propagators", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");

      const propagators: PropagatorConfig[] = [
        {
          type: "traceparent" as const,
          match: [/.*\/api\/.*/],
        },
        {
          type: "xray" as const,
          match: [/.*\.amazonaws\.com.*/, /.*\.aws\.com.*/],
        },
      ];

      init({
        ...baseOptions,
        propagators,
      });

      expect(vars.propagators).toEqual(propagators);
      expect(spyOnWarn).not.toHaveBeenCalled();
    });

    it("should handle empty propagators array (disable propagation)", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");

      init({
        ...baseOptions,
        propagators: [],
      });

      expect(vars.propagators).toEqual([]);
      expect(spyOnWarn).not.toHaveBeenCalled();
    });
  });
});
