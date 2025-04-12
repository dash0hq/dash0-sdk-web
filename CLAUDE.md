# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- Build all: `pnpm run build`
- Format code: `pnpm run prettier:all`
- Check formatting: `pnpm run prettier:check`
- Test: `pnpm run test` (run all tests)
- Test specific file: `pnpm run test src/utils/id_test.ts`
- Test with watch mode: `pnpm run test:watch`
- Test with coverage: `pnpm run test:coverage`

## Code Style

- TypeScript with strict typing and ES modules
- Import style: Group imports from same module, use relative paths for local imports
- Naming: camelCase for variables/functions, PascalCase for types/interfaces, UPPER_SNAKE_CASE for constants
- Error handling: Use try/catch with specific error logging, defensive null checks, optional chaining
- Functions: Pure functions where possible, small and focused with descriptive names
- Testing: Vitest with describe/it style syntax, include expect/describe/it imports from vitest
- Formatting: Code is formatted with Prettier

## Project Structure

- `/src/api`: Public API endpoints
- `/src/utils`: Utility functions and helpers
- `/src/entrypoint`: Entry points for different integration methods
- `/src`: Core functionality
- `/types`: TypeScript type definitions
