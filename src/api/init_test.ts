import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InitOptions, InstrumentationName } from "../types/options";
import { PropagatorConfig, Vars } from "../vars";
import {
  DEPLOYMENT_ENVIRONMENT_NAME,
  DEPLOYMENT_ID,
  DEPLOYMENT_NAME,
  SERVICE_NAME,
  SERVICE_NAMESPACE,
  VCS_CHANGE_ID,
  VCS_OWNER_NAME,
  VCS_PROVIDER_NAME,
  VCS_REF_HEAD_NAME,
  VCS_REF_HEAD_REVISION,
  VCS_REPOSITORY_NAME,
  VCS_REPOSITORY_URL_FULL,
} from "../semantic-conventions";
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

// Mock the utils module to control loc.hostname
vi.mock("../utils", async () => {
  const actual = await vi.importActual("../utils");
  return {
    ...actual,
    loc: { hostname: "test-hostname.example.com" },
  };
});

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

    it("should handle empty propagators array", async () => {
      const spyOnWarn = vi.spyOn(console, "warn");

      init({
        ...baseOptions,
        propagators: [],
      });

      expect(vars.propagators).toEqual([]);
      expect(spyOnWarn).not.toHaveBeenCalled();
    });
  });

  describe("serviceNamespace", () => {
    it("should add serviceNamespace to resource attributes when provided", async () => {
      init({
        ...baseOptions,
        serviceNamespace: "my-namespace",
      });

      const namespaceAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAMESPACE);
      expect(namespaceAttr?.value.stringValue).toBe("my-namespace");
    });

    it("should not add serviceNamespace to resource attributes when not provided", async () => {
      init(baseOptions);

      const namespaceAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAMESPACE);
      expect(namespaceAttr).toBeUndefined();
    });
  });

  describe("serviceName fallback", () => {
    it("should use provided serviceName when it is valid", async () => {
      init({
        ...baseOptions,
        serviceName: "my-service",
      });

      const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
      expect(serviceNameAttr?.value.stringValue).toBe("my-service");
    });

    it("should fallback to location.hostname when serviceName is empty string", async () => {
      init({
        ...baseOptions,
        serviceName: "",
      });

      const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
      expect(serviceNameAttr?.value.stringValue).toBe("test-hostname.example.com");
    });

    it("should fallback to location.hostname when serviceName is only whitespace", async () => {
      init({
        ...baseOptions,
        serviceName: "   ",
      });

      const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
      expect(serviceNameAttr?.value.stringValue).toBe("test-hostname.example.com");
    });

    it("should fallback to location.hostname when serviceName is tabs and spaces", async () => {
      init({
        ...baseOptions,
        serviceName: " \t  \n ",
      });

      const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
      expect(serviceNameAttr?.value.stringValue).toBe("test-hostname.example.com");
    });

    it.each([
      ["single quote", "evil';DROP TABLE users;--"],
      ["double quote", 'svc"name'],
      ["semicolon", "svc;injected"],
      ["open brace", "svc${tpl}"],
      ["close brace", "svc}name"],
      ["less-than", "<script>"],
      ["greater-than", "svc>name"],
      ["embedded newline", "svc\nname"],
      ["NUL byte", "svc\x00name"],
    ])("should fallback to location.hostname by default when serviceName contains %s", async (_label, suspicious) => {
      init({
        ...baseOptions,
        serviceName: suspicious,
      });

      const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
      expect(serviceNameAttr?.value.stringValue).toBe("test-hostname.example.com");
    });

    it.each([
      ["single quote", "evil';DROP TABLE users;--"],
      ["double quote", 'svc"name'],
      ["semicolon", "svc;injected"],
      ["embedded newline", "svc\nname"],
    ])(
      "should also fallback when rejectSuspiciousServiceName is explicitly true and serviceName contains %s",
      async (_label, suspicious) => {
        init({
          ...baseOptions,
          serviceName: suspicious,
          rejectSuspiciousServiceName: true,
        });

        const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
        expect(serviceNameAttr?.value.stringValue).toBe("test-hostname.example.com");
      }
    );

    it.each([
      ["single quote", "evil';DROP TABLE users;--"],
      ["semicolon", "svc;injected"],
      ["less-than", "<script>"],
    ])(
      "should keep suspicious serviceName unchanged when rejectSuspiciousServiceName is explicitly false (%s)",
      async (_label, suspicious) => {
        init({
          ...baseOptions,
          serviceName: suspicious,
          rejectSuspiciousServiceName: false,
        });

        const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
        expect(serviceNameAttr?.value.stringValue).toBe(suspicious);
      }
    );

    it.each([
      ["forward slash", "myteam/myservice"],
      ["backslash", "myteam\\myservice"],
      ["spaces", "my service"],
      ["dots and hyphens", "svc-name.v2"],
    ])(
      "should keep serviceName with allowed characters like %s under the default configuration",
      async (_label, allowed) => {
        init({
          ...baseOptions,
          serviceName: allowed,
        });

        const serviceNameAttr = vars.resource.attributes.find((attr) => attr.key === SERVICE_NAME);
        expect(serviceNameAttr?.value.stringValue).toBe(allowed);
      }
    );

    it("should fallback to 'unknown' when serviceName is empty and location.hostname is not available", async () => {
      vi.resetModules();

      // Mock utils module with loc as undefined
      vi.doMock("../utils", async () => {
        const actual = await vi.importActual("../utils");
        return {
          ...actual,
          loc: undefined,
        };
      });

      const { vars: importedVars } = await import("../vars");
      const { init: importedInit } = await import("./init");
      const { SERVICE_NAME: importedServiceName } = await import("../semantic-conventions");

      importedInit({
        ...baseOptions,
        serviceName: "",
      });

      const serviceNameAttr = importedVars.resource.attributes.find((attr) => attr.key === importedServiceName);
      expect(serviceNameAttr?.value.stringValue).toBe("unknown");
    });
  });

  describe("vcs auto-detection", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const stringAttr = (key: string) => vars.resource.attributes.find((attr) => attr.key === key)?.value.stringValue;

    it("derives full vcs resource attributes from Vercel env vars", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "github");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "dash0hq");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG", "dash0");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF", "main");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc123");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID", "42");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("dash0hq");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("dash0");
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("https://github.com/dash0hq/dash0");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("main");
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("abc123");
      expect(stringAttr(VCS_CHANGE_ID)).toBe("42");
    });

    // The 9 framework prefixes Vercel auto-prefixes its VERCEL_GIT_* system
    // vars under (per https://vercel.com/docs/environment-variables/framework-environment-variables).
    // A passing test for each confirms the literal-accessor enumeration in
    // detectVcsFromVercel is actually wired up.
    const FRAMEWORK_PREFIX_SAMPLES: Array<[label: string, prefix: string]> = [
      ["Next.js", "NEXT_PUBLIC_"],
      ["Nuxt 3", "NUXT_PUBLIC_"],
      ["Nuxt 2", "NUXT_ENV_"],
      ["Create React App", "REACT_APP_"],
      ["Gatsby", "GATSBY_"],
      ["Vite", "VITE_"],
      ["Astro / SvelteKit / Hydrogen", "PUBLIC_"],
      ["Vue CLI", "VUE_APP_"],
      ["RedwoodJS", "REDWOOD_ENV_"],
      ["Sanity Studio", "SANITY_STUDIO_"],
    ];

    it.each(FRAMEWORK_PREFIX_SAMPLES)(
      "derives Vercel vcs attributes from %s framework prefix (%s)",
      (_label, prefix) => {
        vi.stubEnv(`${prefix}VERCEL_GIT_PROVIDER`, "github");
        vi.stubEnv(`${prefix}VERCEL_GIT_REPO_OWNER`, "dash0hq");
        vi.stubEnv(`${prefix}VERCEL_GIT_REPO_SLUG`, "dash0");
        vi.stubEnv(`${prefix}VERCEL_GIT_COMMIT_REF`, "main");
        vi.stubEnv(`${prefix}VERCEL_GIT_COMMIT_SHA`, "abc123");
        vi.stubEnv(`${prefix}VERCEL_GIT_PULL_REQUEST_ID`, "42");

        init(baseOptions);

        expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
        expect(stringAttr(VCS_OWNER_NAME)).toBe("dash0hq");
        expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("dash0");
        expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("https://github.com/dash0hq/dash0");
        expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("main");
        expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("abc123");
        expect(stringAttr(VCS_CHANGE_ID)).toBe("42");
      }
    );

    it.each(FRAMEWORK_PREFIX_SAMPLES)(
      "derives Netlify vcs attributes from %s framework prefix (%s)",
      (_label, prefix) => {
        vi.stubEnv(`${prefix}REPOSITORY_URL`, "https://github.com/dash0hq/dash0");
        vi.stubEnv(`${prefix}BRANCH`, "feature/x");
        vi.stubEnv(`${prefix}COMMIT_REF`, "def456");
        vi.stubEnv(`${prefix}REVIEW_ID`, "99");

        init(baseOptions);

        expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
        expect(stringAttr(VCS_OWNER_NAME)).toBe("dash0hq");
        expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("dash0");
        expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("feature/x");
        expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("def456");
        expect(stringAttr(VCS_CHANGE_ID)).toBe("99");
      }
    );

    it("derives vcs resource attributes from Netlify env vars (parsed REPOSITORY_URL)", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://github.com/dash0hq/dash0.git");
      vi.stubEnv("NEXT_PUBLIC_BRANCH", "feature/x");
      vi.stubEnv("NEXT_PUBLIC_COMMIT_REF", "def456");
      vi.stubEnv("NEXT_PUBLIC_REVIEW_ID", "99");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("dash0hq");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("dash0");
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("https://github.com/dash0hq/dash0.git");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("feature/x");
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("def456");
      expect(stringAttr(VCS_CHANGE_ID)).toBe("99");
    });

    it("prefers Vercel values over Netlify values when both are present", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "github");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "vercel-owner");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG", "vercel-repo");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF", "vercel-branch");
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://github.com/netlify-owner/netlify-repo");
      vi.stubEnv("NEXT_PUBLIC_BRANCH", "netlify-branch");

      init(baseOptions);

      expect(stringAttr(VCS_OWNER_NAME)).toBe("vercel-owner");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("vercel-repo");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("vercel-branch");
    });

    it("opts.vcs overrides individual auto-detected fields", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "github");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "dash0hq");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG", "dash0");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF", "main");

      init({
        ...baseOptions,
        vcs: {
          refHeadName: "release/2026.06",
          changeId: "1234",
        },
      });

      expect(stringAttr(VCS_OWNER_NAME)).toBe("dash0hq");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("release/2026.06");
      expect(stringAttr(VCS_CHANGE_ID)).toBe("1234");
    });

    it("disableVcsDetection: true emits no vcs.* resource attributes even when env vars are set", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "github");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "dash0hq");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc123");

      init({ ...baseOptions, disableVcsDetection: true });

      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBeUndefined();
    });

    it("disableVcsDetection: true still applies opts.vcs manual overrides", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "github");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "dash0hq");

      init({
        ...baseOptions,
        disableVcsDetection: true,
        vcs: { providerName: "gitlab", refHeadName: "release/1.0" },
      });

      // env-var values are suppressed
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      // manual overrides still win
      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("gitlab");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("release/1.0");
    });

    it("applies opts.vcs fields as the sole source when no env vars are set", () => {
      init({
        ...baseOptions,
        vcs: {
          providerName: "github",
          ownerName: "my-org",
          repositoryName: "my-repo",
          repositoryUrlFull: "https://github.com/my-org/my-repo",
          refHeadName: "main",
          refHeadRevision: "deadbeef",
          changeId: "7",
        },
      });

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("my-org");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("my-repo");
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("https://github.com/my-org/my-repo");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("main");
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("deadbeef");
      expect(stringAttr(VCS_CHANGE_ID)).toBe("7");
    });

    it("emits nothing when no env vars and no opts.vcs are provided", () => {
      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBeUndefined();
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBeUndefined();
      expect(stringAttr(VCS_CHANGE_ID)).toBeUndefined();
    });

    it("emits only the partial attributes that are available", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc123");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF", "main");

      init(baseOptions);

      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("main");
      expect(stringAttr(VCS_REF_HEAD_REVISION)).toBe("abc123");
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBeUndefined();
      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
    });

    it("does not derive repository URL when provider is unknown", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_PROVIDER", "someproprietary");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", "owner");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG", "repo");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("someproprietary");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("owner");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("repo");
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBeUndefined();
    });

    it("accepts gist.github.com as a github host alias", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://gist.github.com/owner/abc123");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("github");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("owner");
    });

    it("rejects arbitrary github.com subdomains", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://evil.github.com/attacker/repo");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBeUndefined();
    });

    it("ignores a Netlify REPOSITORY_URL on an unknown host", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://internal-git.example.com/team/app");
      vi.stubEnv("NEXT_PUBLIC_BRANCH", "main");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("https://internal-git.example.com/team/app");
      expect(stringAttr(VCS_REF_HEAD_NAME)).toBe("main");
    });

    it("parses GitLab nested-group repository URLs to the last path segment", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "https://gitlab.com/group/subgroup/app.git");

      init(baseOptions);

      expect(stringAttr(VCS_PROVIDER_NAME)).toBe("gitlab");
      expect(stringAttr(VCS_OWNER_NAME)).toBe("group");
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBe("app");
    });

    it("ignores a malformed REPOSITORY_URL", () => {
      vi.stubEnv("NEXT_PUBLIC_REPOSITORY_URL", "not-a-url");

      init(baseOptions);

      expect(stringAttr(VCS_REPOSITORY_URL_FULL)).toBe("not-a-url");
      expect(stringAttr(VCS_PROVIDER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_OWNER_NAME)).toBeUndefined();
      expect(stringAttr(VCS_REPOSITORY_NAME)).toBeUndefined();
    });
  });

  describe("environment + deployment auto-detection", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const stringAttr = (key: string) => vars.resource.attributes.find((attr) => attr.key === key)?.value.stringValue;

    // The 9 framework prefixes Vercel auto-prefixes its `VERCEL_*` system
    // vars under (per https://vercel.com/docs/environment-variables/framework-environment-variables).
    // Same matrix the VCS detection uses, sourced from the shared
    // `FrameworkPrefix` union in `./browser-env`.
    const FRAMEWORK_PREFIX_SAMPLES: Array<[label: string, prefix: string]> = [
      ["Next.js", "NEXT_PUBLIC_"],
      ["Nuxt 3", "NUXT_PUBLIC_"],
      ["Nuxt 2", "NUXT_ENV_"],
      ["Create React App", "REACT_APP_"],
      ["Gatsby", "GATSBY_"],
      ["Vite", "VITE_"],
      ["Astro / SvelteKit / Hydrogen", "PUBLIC_"],
      ["Vue CLI", "VUE_APP_"],
      ["RedwoodJS", "REDWOOD_ENV_"],
      ["Sanity Studio", "SANITY_STUDIO_"],
    ];

    it.each(FRAMEWORK_PREFIX_SAMPLES)(
      "derives environment + deployment resource attributes from %s framework prefix (%s)",
      (_label, prefix) => {
        vi.stubEnv(`${prefix}VERCEL_ENV`, "production");
        vi.stubEnv(`${prefix}VERCEL_TARGET_ENV`, "production");
        vi.stubEnv(`${prefix}VERCEL_BRANCH_URL`, "my-site-git-main.vercel.app");

        init(baseOptions);

        expect(stringAttr(DEPLOYMENT_ENVIRONMENT_NAME)).toBe("production");
        expect(stringAttr(DEPLOYMENT_NAME)).toBe("production");
        expect(stringAttr(DEPLOYMENT_ID)).toBe("my-site-git-main.vercel.app");
      }
    );

    it("opts.environment / opts.deploymentName / opts.deploymentId override env-var detection", () => {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "from-env");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_TARGET_ENV", "from-env");
      vi.stubEnv("NEXT_PUBLIC_VERCEL_BRANCH_URL", "from-env");

      init({
        ...baseOptions,
        environment: "manual-environment",
        deploymentName: "manual-deployment-name",
        deploymentId: "manual-deployment-id",
      });

      expect(stringAttr(DEPLOYMENT_ENVIRONMENT_NAME)).toBe("manual-environment");
      expect(stringAttr(DEPLOYMENT_NAME)).toBe("manual-deployment-name");
      expect(stringAttr(DEPLOYMENT_ID)).toBe("manual-deployment-id");
    });

    it("emits no environment/deployment attributes when neither env vars nor opts are set", () => {
      init(baseOptions);

      expect(stringAttr(DEPLOYMENT_ENVIRONMENT_NAME)).toBeUndefined();
      expect(stringAttr(DEPLOYMENT_NAME)).toBeUndefined();
      expect(stringAttr(DEPLOYMENT_ID)).toBeUndefined();
    });
  });
});
