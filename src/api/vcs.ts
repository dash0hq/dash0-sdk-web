import { vars } from "../vars";
import {
  VCS_CHANGE_ID,
  VCS_OWNER_NAME,
  VCS_PROVIDER_NAME,
  VCS_REF_HEAD_NAME,
  VCS_REF_HEAD_REVISION,
  VCS_REPOSITORY_NAME,
  VCS_REPOSITORY_URL_FULL,
} from "../semantic-conventions";
import { InitOptions, VcsAttributes } from "../types/options";
import { addAttribute } from "../utils/otel";
import { BrowserBuildEnv, pickFirstString } from "./browser-env";

declare const process: { env?: BrowserBuildEnv } | undefined;

// Single source of truth mapping each VcsAttributes field to its OTel
// resource attribute name. Typed as `Record<keyof VcsAttributes, string>` so
// adding a field to VcsAttributes without adding an entry here is a compile
// error — no silent "I forgot to apply that field" bugs.
const VCS_FIELD_TO_ATTRIBUTE: Record<keyof VcsAttributes, string> = {
  providerName: VCS_PROVIDER_NAME,
  ownerName: VCS_OWNER_NAME,
  repositoryName: VCS_REPOSITORY_NAME,
  repositoryUrlFull: VCS_REPOSITORY_URL_FULL,
  refHeadName: VCS_REF_HEAD_NAME,
  refHeadRevision: VCS_REF_HEAD_REVISION,
  changeId: VCS_CHANGE_ID,
};

/**
 * Derive VCS (version control) context from the build environment and apply
 * the resulting `vcs.*` resource attributes to `vars.resource.attributes`.
 *
 * Detection precedence per attribute: `opts.vcs` → Vercel env vars → Netlify
 * env vars. Manual overrides via `opts.vcs` always win, even when
 * `opts.disableVcsDetection` is set.
 */
export function applyVcsResourceAttributes(opts: InitOptions) {
  const vcs = detectVcs(opts);
  for (const field of Object.keys(VCS_FIELD_TO_ATTRIBUTE) as (keyof VcsAttributes)[]) {
    const value = vcs[field];
    if (value) {
      addAttribute(vars.resource.attributes, VCS_FIELD_TO_ATTRIBUTE[field], value);
    }
  }
}

function detectVcs(opts: InitOptions): VcsAttributes {
  // opts.vcs manual overrides always win, even when auto-detection is disabled.
  // This lets callers on non-Vercel/Netlify platforms supply context explicitly
  // while still opting out of any env-var reading.
  const override = opts.vcs ?? {};

  if (opts.disableVcsDetection) {
    return override;
  }

  const vercel = detectVcsFromVercel();
  const netlify = detectVcsFromNetlify();

  return {
    providerName: override.providerName ?? vercel.providerName ?? netlify.providerName,
    ownerName: override.ownerName ?? vercel.ownerName ?? netlify.ownerName,
    repositoryName: override.repositoryName ?? vercel.repositoryName ?? netlify.repositoryName,
    repositoryUrlFull: override.repositoryUrlFull ?? vercel.repositoryUrlFull ?? netlify.repositoryUrlFull,
    refHeadName: override.refHeadName ?? vercel.refHeadName ?? netlify.refHeadName,
    refHeadRevision: override.refHeadRevision ?? vercel.refHeadRevision ?? netlify.refHeadRevision,
    changeId: override.changeId ?? vercel.changeId ?? netlify.changeId,
  };
}

// Frameworks expose env vars to the browser bundle using a per-framework
// prefix (Next.js `NEXT_PUBLIC_*`, Vite `VITE_*`, etc.). For each known
// vendor suffix (e.g. Vercel's `VERCEL_GIT_PROVIDER`, Netlify's
// `REPOSITORY_URL`) we enumerate the prefixed variants below.
//
// IMPORTANT: each `process.env.NAME` MUST be a LITERAL accessor. Webpack
// DefinePlugin, Next.js, Gatsby, and equivalents substitute env vars at
// build time only when they see the literal form. Dynamic lookups like
// `process.env[name]` or iterating a string array are NOT substituted —
// they would resolve to `undefined` in the browser bundle.
//
// The 9 prefixes below are the framework presets Vercel auto-prefixes
// `VERCEL_*` system vars under (https://vercel.com/docs/environment-variables/framework-environment-variables).
// Users on platforms without auto-prefixing (Netlify, Cloudflare Pages, custom
// CI) can manually expose any env var under any of these prefixes and get
// the same auto-detection.
//
// Adding a new framework prefix = one new literal accessor per attribute in
// each `detectVcsFrom*` function below.

function detectVcsFromVercel(): VcsAttributes {
  let provider: string | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | undefined;
  let revision: string | undefined;
  let changeId: string | undefined;
  try {
    provider = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_PROVIDER,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_PROVIDER,
      process?.env?.NUXT_ENV_VERCEL_GIT_PROVIDER,
      process?.env?.REACT_APP_VERCEL_GIT_PROVIDER,
      process?.env?.GATSBY_VERCEL_GIT_PROVIDER,
      process?.env?.VITE_VERCEL_GIT_PROVIDER,
      process?.env?.PUBLIC_VERCEL_GIT_PROVIDER,
      process?.env?.VUE_APP_VERCEL_GIT_PROVIDER,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_PROVIDER,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_PROVIDER
    );
    owner = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_REPO_OWNER,
      process?.env?.NUXT_ENV_VERCEL_GIT_REPO_OWNER,
      process?.env?.REACT_APP_VERCEL_GIT_REPO_OWNER,
      process?.env?.GATSBY_VERCEL_GIT_REPO_OWNER,
      process?.env?.VITE_VERCEL_GIT_REPO_OWNER,
      process?.env?.PUBLIC_VERCEL_GIT_REPO_OWNER,
      process?.env?.VUE_APP_VERCEL_GIT_REPO_OWNER,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_REPO_OWNER,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_REPO_OWNER
    );
    repo = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_REPO_SLUG,
      process?.env?.NUXT_ENV_VERCEL_GIT_REPO_SLUG,
      process?.env?.REACT_APP_VERCEL_GIT_REPO_SLUG,
      process?.env?.GATSBY_VERCEL_GIT_REPO_SLUG,
      process?.env?.VITE_VERCEL_GIT_REPO_SLUG,
      process?.env?.PUBLIC_VERCEL_GIT_REPO_SLUG,
      process?.env?.VUE_APP_VERCEL_GIT_REPO_SLUG,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_REPO_SLUG,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_REPO_SLUG
    );
    ref = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
      process?.env?.NUXT_ENV_VERCEL_GIT_COMMIT_REF,
      process?.env?.REACT_APP_VERCEL_GIT_COMMIT_REF,
      process?.env?.GATSBY_VERCEL_GIT_COMMIT_REF,
      process?.env?.VITE_VERCEL_GIT_COMMIT_REF,
      process?.env?.PUBLIC_VERCEL_GIT_COMMIT_REF,
      process?.env?.VUE_APP_VERCEL_GIT_COMMIT_REF,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_COMMIT_REF,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_COMMIT_REF
    );
    revision = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      process?.env?.NUXT_ENV_VERCEL_GIT_COMMIT_SHA,
      process?.env?.REACT_APP_VERCEL_GIT_COMMIT_SHA,
      process?.env?.GATSBY_VERCEL_GIT_COMMIT_SHA,
      process?.env?.VITE_VERCEL_GIT_COMMIT_SHA,
      process?.env?.PUBLIC_VERCEL_GIT_COMMIT_SHA,
      process?.env?.VUE_APP_VERCEL_GIT_COMMIT_SHA,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_COMMIT_SHA,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_COMMIT_SHA
    );
    changeId = pickFirstString(
      process?.env?.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.NUXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.NUXT_ENV_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.REACT_APP_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.GATSBY_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.VITE_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.PUBLIC_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.VUE_APP_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.REDWOOD_ENV_VERCEL_GIT_PULL_REQUEST_ID,
      process?.env?.SANITY_STUDIO_VERCEL_GIT_PULL_REQUEST_ID
    );
  } catch (_ignored) {
    // process is not defined (or a bundler shimmed it strangely) — skip.
  }

  return {
    providerName: provider,
    ownerName: owner,
    repositoryName: repo,
    repositoryUrlFull: buildRepositoryUrlFromVercel(provider, owner, repo),
    refHeadName: ref,
    refHeadRevision: revision,
    changeId,
  };
}

function detectVcsFromNetlify(): VcsAttributes {
  // Netlify exposes read-only build env vars (REPOSITORY_URL, BRANCH,
  // COMMIT_REF, REVIEW_ID) but does not auto-prefix them for browser
  // exposure. Users must surface them via their framework's prefix
  // convention themselves (e.g. `NEXT_PUBLIC_REPOSITORY_URL = $REPOSITORY_URL`
  // for Next.js, `VITE_REPOSITORY_URL = $REPOSITORY_URL` for Vite, etc.).
  // We enumerate the same 9 framework prefixes as the Vercel path above.
  let repositoryUrl: string | undefined;
  let branch: string | undefined;
  let commit: string | undefined;
  let reviewId: string | undefined;
  try {
    repositoryUrl = pickFirstString(
      process?.env?.NEXT_PUBLIC_REPOSITORY_URL,
      process?.env?.NUXT_PUBLIC_REPOSITORY_URL,
      process?.env?.NUXT_ENV_REPOSITORY_URL,
      process?.env?.REACT_APP_REPOSITORY_URL,
      process?.env?.GATSBY_REPOSITORY_URL,
      process?.env?.VITE_REPOSITORY_URL,
      process?.env?.PUBLIC_REPOSITORY_URL,
      process?.env?.VUE_APP_REPOSITORY_URL,
      process?.env?.REDWOOD_ENV_REPOSITORY_URL,
      process?.env?.SANITY_STUDIO_REPOSITORY_URL
    );
    branch = pickFirstString(
      process?.env?.NEXT_PUBLIC_BRANCH,
      process?.env?.NUXT_PUBLIC_BRANCH,
      process?.env?.NUXT_ENV_BRANCH,
      process?.env?.REACT_APP_BRANCH,
      process?.env?.GATSBY_BRANCH,
      process?.env?.VITE_BRANCH,
      process?.env?.PUBLIC_BRANCH,
      process?.env?.VUE_APP_BRANCH,
      process?.env?.REDWOOD_ENV_BRANCH,
      process?.env?.SANITY_STUDIO_BRANCH
    );
    commit = pickFirstString(
      process?.env?.NEXT_PUBLIC_COMMIT_REF,
      process?.env?.NUXT_PUBLIC_COMMIT_REF,
      process?.env?.NUXT_ENV_COMMIT_REF,
      process?.env?.REACT_APP_COMMIT_REF,
      process?.env?.GATSBY_COMMIT_REF,
      process?.env?.VITE_COMMIT_REF,
      process?.env?.PUBLIC_COMMIT_REF,
      process?.env?.VUE_APP_COMMIT_REF,
      process?.env?.REDWOOD_ENV_COMMIT_REF,
      process?.env?.SANITY_STUDIO_COMMIT_REF
    );
    reviewId = pickFirstString(
      process?.env?.NEXT_PUBLIC_REVIEW_ID,
      process?.env?.NUXT_PUBLIC_REVIEW_ID,
      process?.env?.NUXT_ENV_REVIEW_ID,
      process?.env?.REACT_APP_REVIEW_ID,
      process?.env?.GATSBY_REVIEW_ID,
      process?.env?.VITE_REVIEW_ID,
      process?.env?.PUBLIC_REVIEW_ID,
      process?.env?.VUE_APP_REVIEW_ID,
      process?.env?.REDWOOD_ENV_REVIEW_ID,
      process?.env?.SANITY_STUDIO_REVIEW_ID
    );
  } catch (_ignored) {
    // process is not defined — skip.
  }

  const parsed = parseRepositoryUrl(repositoryUrl);
  return {
    providerName: parsed?.providerName,
    ownerName: parsed?.ownerName,
    repositoryName: parsed?.repositoryName,
    repositoryUrlFull: repositoryUrl,
    refHeadName: branch,
    refHeadRevision: commit,
    changeId: reviewId,
  };
}

function buildRepositoryUrlFromVercel(
  provider: string | undefined,
  owner: string | undefined,
  repo: string | undefined
): string | undefined {
  if (!provider || !owner || !repo) return undefined;
  const host = vcsHostForProvider(provider);
  if (!host) return undefined;
  return `https://${host}/${owner}/${repo}`;
}

// Single source of truth for provider↔host mapping. Both `vcsHostForProvider`
// (Vercel path: provider name is known, derive the canonical host) and
// `vcsProviderForHost` (Netlify path: only the URL is known, derive the
// provider) consult this map so adding a provider is one edit. Each entry is
// a list of accepted hostnames; the FIRST entry is the canonical host used
// when building URLs from a provider name. Subsequent entries are exact
// aliases — we do not match arbitrary subdomains.
const VCS_PROVIDER_HOSTS: Record<string, readonly string[]> = {
  github: ["github.com", "gist.github.com"],
  gitlab: ["gitlab.com"],
  bitbucket: ["bitbucket.org"],
};

function vcsHostForProvider(provider: string): string | undefined {
  return VCS_PROVIDER_HOSTS[provider]?.[0];
}

function parseRepositoryUrl(
  url: string | undefined
): { providerName: string; ownerName: string; repositoryName: string } | undefined {
  if (!url) return undefined;

  let host: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    host = parsed.host;
    pathname = parsed.pathname;
  } catch (_ignored) {
    return undefined;
  }

  const provider = vcsProviderForHost(host);
  if (!provider) return undefined;

  const trimmed = pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  const segments = trimmed.split("/");
  if (segments.length < 2) return undefined;

  const ownerName = segments[0];
  // Bitbucket and GitLab can have nested groups; the repository slug is the
  // last path segment. GitHub paths are always two segments.
  const repositoryName = segments[segments.length - 1];
  if (!ownerName || !repositoryName) return undefined;

  return { providerName: provider, ownerName, repositoryName };
}

function vcsProviderForHost(host: string): string | undefined {
  for (const [provider, hosts] of Object.entries(VCS_PROVIDER_HOSTS)) {
    if (hosts.includes(host)) return provider;
  }
  return undefined;
}
