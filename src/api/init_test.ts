import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InitOptions, InstrumentationName } from "../types/options";

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

import { startWebVitalsInstrumentation } from "../instrumentations/web-vitals";
import { startErrorInstrumentation } from "../instrumentations/errors";
import { instrumentFetch } from "../instrumentations/http/fetch";
import { startNavigationInstrumentation } from "../instrumentations/navigation";

describe("init", () => {
  const baseOptions: InitOptions = {
    serviceName: "test-service",
    endpoint: { url: "https://test-endpoint.com", authToken: "invalid" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the hasBeenInitialised flag by re-importing the module
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("instrumentation enablement", () => {
    it("should enable all instrumentations when enabledInstrumentations is undefined", async () => {
      const { init } = await import("./init");

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
        const { init } = await import("./init");

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
        const { init } = await import("./init");

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
});
