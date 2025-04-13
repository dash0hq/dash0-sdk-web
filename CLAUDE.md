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
- E2E Test: `pnpm run test:e2e` (run all e2e tests)

## Code Style

- TypeScript with strict typing and ES modules
- Import style: Group imports from same module, use relative paths for local imports
- Naming: camelCase for variables/functions, PascalCase for types/interfaces, UPPER_SNAKE_CASE for constants
- Error handling: Use try/catch with specific error logging, defensive null checks, optional chaining
- Functions: Pure functions where possible, small and focused with descriptive names
- Unit Testing: Vitest with describe/it style syntax, include expect/describe/it imports from vitest
- E2E Testing: Playwright with test syntax, include expect/test imports from @playwright/test
- Formatting: Code is formatted with Prettier

## Project Structure

- `/src/api`: Public API endpoints
- `/src/utils`: Utility functions and helpers
- `/src/entrypoint`: Entry points for different integration methods
- `/src/instrumentations`: Hooks into public APIs and events that generate data
- `/src/transport`: Data transmission to Dash0's servers
- `/test/server`: Test server that serves E2E test files, and acts as a server receiving OTLP requests.
- `/test/e2e`: End-to-End tests based on Playwright reside in this directory.
