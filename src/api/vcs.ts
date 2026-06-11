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
  if (vcs.providerName) {
    addAttribute(vars.resource.attributes, VCS_PROVIDER_NAME, vcs.providerName);
  }
  if (vcs.ownerName) {
    addAttribute(vars.resource.attributes, VCS_OWNER_NAME, vcs.ownerName);
  }
  if (vcs.repositoryName) {
    addAttribute(vars.resource.attributes, VCS_REPOSITORY_NAME, vcs.repositoryName);
  }
  if (vcs.repositoryUrlFull) {
    addAttribute(vars.resource.attributes, VCS_REPOSITORY_URL_FULL, vcs.repositoryUrlFull);
  }
  if (vcs.refHeadName) {
    addAttribute(vars.resource.attributes, VCS_REF_HEAD_NAME, vcs.refHeadName);
  }
  if (vcs.refHeadRevision) {
    addAttribute(vars.resource.attributes, VCS_REF_HEAD_REVISION, vcs.refHeadRevision);
  }
  if (vcs.changeId) {
    addAttribute(vars.resource.attributes, VCS_CHANGE_ID, vcs.changeId);
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

function detectVcsFromVercel(): VcsAttributes {
  // Vercel exposes its system git env vars to the browser bundle by also
  // emitting `NEXT_PUBLIC_VERCEL_GIT_*` variants. Each read goes through the
  // literal `process.env.NAME` form on purpose: webpack DefinePlugin (and
  // friends) replace these at build time only when they see the literal
  // accessor — a dynamic lookup like `process.env[name]` is not substituted
  // and would resolve to `undefined` in the browser.
  let provider: string | undefined;
  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | undefined;
  let revision: string | undefined;
  let changeId: string | undefined;
  try {
    // @ts-expect-error -- literal accessor required for build-time replacement
    provider = process?.env?.NEXT_PUBLIC_VERCEL_GIT_PROVIDER;
    // @ts-expect-error -- literal accessor required for build-time replacement
    owner = process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER;
    // @ts-expect-error -- literal accessor required for build-time replacement
    repo = process?.env?.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG;
    // @ts-expect-error -- literal accessor required for build-time replacement
    ref = process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;
    // @ts-expect-error -- literal accessor required for build-time replacement
    revision = process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    // @ts-expect-error -- literal accessor required for build-time replacement
    changeId = process?.env?.NEXT_PUBLIC_VERCEL_GIT_PULL_REQUEST_ID;
  } catch (_ignored) {
    // process is not defined (or some bundler shimmed it strangely) — skip.
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
  // Netlify exposes read-only build env vars that the user must surface to the
  // browser bundle themselves — for Next.js that means setting
  // `NEXT_PUBLIC_*` variants (e.g. `NEXT_PUBLIC_REPOSITORY_URL = $REPOSITORY_URL`).
  // Same `process.env.NAME` literal-accessor requirement as the Vercel path.
  let repositoryUrl: string | undefined;
  let branch: string | undefined;
  let commit: string | undefined;
  let reviewId: string | undefined;
  try {
    // @ts-expect-error -- literal accessor required for build-time replacement
    repositoryUrl = process?.env?.NEXT_PUBLIC_REPOSITORY_URL;
    // @ts-expect-error -- literal accessor required for build-time replacement
    branch = process?.env?.NEXT_PUBLIC_BRANCH;
    // @ts-expect-error -- literal accessor required for build-time replacement
    commit = process?.env?.NEXT_PUBLIC_COMMIT_REF;
    // @ts-expect-error -- literal accessor required for build-time replacement
    reviewId = process?.env?.NEXT_PUBLIC_REVIEW_ID;
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
