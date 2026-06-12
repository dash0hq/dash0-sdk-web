// Shared types and helpers for reading build-environment variables exposed
// to the browser bundle. Owned by this module because it is used from both
// init.ts (environment / deployment detection) and vcs.ts (VCS detection).
//
// IMPORTANT: each `process.env.NAME` MUST be a LITERAL accessor in the
// caller's source. Webpack DefinePlugin, Next.js, Gatsby, and equivalents
// substitute env vars at build time only when they see the literal form.
// Dynamic lookups (`process.env[name]`, iterating a string array) are NOT
// substituted — they resolve to `undefined` in the browser bundle.
//
// The type unions below are the single source of truth for which env var
// names the SDK reads. They are composed via template-literal types so
// every (prefix × suffix) combination is enumerated at the type level.
// Adding a framework prefix is a one-line edit to `FrameworkPrefix`; adding
// a suffix is a one-line edit to the appropriate suffix union.

/**
 * Framework prefixes that bundlers expose to the browser bundle. Vercel
 * auto-prefixes its `VERCEL_*` system vars under each of these (per
 * https://vercel.com/docs/environment-variables/framework-environment-variables).
 * Users on platforms without auto-prefixing (Netlify, Cloudflare Pages,
 * custom CI) can expose env vars under any of these prefixes to get the
 * same detection.
 */
export type FrameworkPrefix =
  | "NEXT_PUBLIC_"
  | "NUXT_ENV_"
  | "REACT_APP_"
  | "GATSBY_"
  | "VITE_"
  | "PUBLIC_"
  | "VUE_APP_"
  | "REDWOOD_ENV_"
  | "SANITY_STUDIO_";

/** Vercel system env vars consumed by detectEnvironment / detectDeploymentName / detectDeploymentId. */
type VercelDeploymentSuffix = "VERCEL_ENV" | "VERCEL_TARGET_ENV" | "VERCEL_BRANCH_URL";

/** Vercel git env vars consumed by VCS detection. */
type VercelGitSuffix =
  | "VERCEL_GIT_PROVIDER"
  | "VERCEL_GIT_REPO_OWNER"
  | "VERCEL_GIT_REPO_SLUG"
  | "VERCEL_GIT_COMMIT_REF"
  | "VERCEL_GIT_COMMIT_SHA"
  | "VERCEL_GIT_PULL_REQUEST_ID";

/** Netlify build env vars (Netlify does not auto-prefix; users surface these via their framework convention). */
type NetlifyGitSuffix = "REPOSITORY_URL" | "BRANCH" | "COMMIT_REF" | "REVIEW_ID";

/** Every env var name the SDK reads as a literal `process.env.X` accessor. */
type BrowserBuildEnvKey = `${FrameworkPrefix}${VercelDeploymentSuffix | VercelGitSuffix | NetlifyGitSuffix}`;

/**
 * Module-locally typed shape of `process.env`. Consumers re-declare `process`
 * with this type so dot-notation accessors are typed (no `@ts-expect-error`)
 * and `noPropertyAccessFromIndexSignature` does not fire (each key is a
 * known union member, not an index signature).
 */
export type BrowserBuildEnv = { readonly [K in BrowserBuildEnvKey]?: string };

/**
 * Return the first defined and non-empty value, or undefined. Used to walk
 * the list of framework-prefixed variants of an env var and pick whichever
 * the user's bundler substituted at build time.
 */
export function pickFirstString(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}
