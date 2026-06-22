# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- Build all: `pnpm run build`
- Format code: `pnpm run prettier:all`
- Check formatting: `pnpm run prettier:check`
- Lint Code: `pnpm run lint`
- Unit Test: `pnpm run test:unit` (run all unit tests)
- Unit Test specific file: `pnpm run test:unit src/utils/id_test.ts`
- Unit Test with watch mode: `pnpm run:unit test:watch`
- Unit Test with coverage: `pnpm run test:unit:coverage`
- E2E Test: `pnpm run test:e2e:local` (run all e2e tests, locally for faster iteration without remote runs)

## Code Style

- TypeScript with strict typing and ES modules
- Import style: Group imports from same module, use relative paths for local imports
- Naming: camelCase for variables/functions, PascalCase for types/interfaces, UPPER_SNAKE_CASE for constants
- Error handling: Use try/catch with specific error logging, defensive null checks, optional chaining
- Functions: Pure functions where possible, small and focused with descriptive names
- Unit Testing: Vitest with describe/it style syntax, include expect/describe/it imports from vitest
- E2E Testing: webdriver io with mocha test framework
- Formatting: Code is formatted with Prettier

## Project Structure

- `/src/api`: Public API endpoints
- `/src/utils`: Utility functions and helpers
- `/src/entrypoint`: Entry points for different integration methods
- `/src/instrumentations`: Hooks into public APIs and events that generate data
- `/src/transport`: Data transmission to Dash0's servers
- `/test/server`: Test server that serves E2E test files, and acts as a server receiving OTLP requests.
- `/test/e2e`: End-to-End tests reside in this directory.

## Build-environment variables (process.env)

The SDK reads `process.env.NAME` to auto-detect resource attributes from the build environment (`deployment.*`, `vcs.*`). Two rules govern this code path:

1. **Fan out across every framework prefix in `FrameworkPrefix`.** The union in [`src/api/browser-env.ts`](src/api/browser-env.ts) is the single source of truth for the framework prefixes the SDK supports (`NEXT_PUBLIC_`, `NUXT_ENV_`, `REACT_APP_`, `GATSBY_`, `VITE_`, `PUBLIC_`, `VUE_APP_`, `REDWOOD_ENV_`, `SANITY_STUDIO_`). When you add a new attribute the SDK should auto-detect from `process.env`, enumerate it under **every** prefix — not just `NEXT_PUBLIC_`. This is what lets the SDK work for Vite, Nuxt, Gatsby, Astro, etc., not just Next.js. Update `INSTALL.md > Configuration auto-detection` to list the new attribute under the same prefix coverage.

2. **Use literal `process.env.NAME` accessors only.** Webpack DefinePlugin, Next.js, Gatsby, and equivalents substitute env vars at build time only when they see the literal dot-notation form in the AST. Dynamic forms (`process.env[name]`, `Object.keys(process.env)`, iterating an array of names) are **not** substituted — they resolve to `undefined` in the browser bundle. The `BrowserBuildEnv` template-literal type in `browser-env.ts` enumerates every valid (prefix × suffix) combination so each call site stays typed without `@ts-expect-error` — add new suffixes there. Note: Vite does not substitute `process.env.X` natively (it uses `import.meta.env.VITE_*`), so the `VITE_` prefix path only resolves at runtime when the consumer's build environment substitutes it — Vercel does this inside its Vite preset; other platforms require a `define` entry in `vite.config.ts`.
