import type { Config } from "release-it";

export default {
  git: {
    commit: true,
    tag: true,
    push: true,
    requireCommits: true,
  },
  github: {
    release: true,
  },
  npm: {
    publish: true,
    skipChecks: true, // See: https://github.com/release-it/release-it/blob/main/docs/npm.md#npm
  },
  plugins: {
    "@release-it/conventional-changelog": {
      preset: "conventionalcommits",
      infile: "CHANGELOG.md",
      header: "# Changelog",
    },
  },
  hooks: {
    "after:bump": "pnpm run build",
    "before:git:release": ["pnpm run prettier:all", "git add . --update"],
  },
} satisfies Config;
