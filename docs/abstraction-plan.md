# Abstraction Plan: Separating Core Telemetry from Browser-Specific Implementation

## Executive Summary

This document outlines a comprehensive plan to refactor the `@dash0/sdk-web` package into two distinct packages:

1. **`@dash0/sdk-core`** - Platform-agnostic telemetry core
2. **`@dash0/sdk-web`** - Browser-specific implementation using the core

This separation will enable the creation of additional platform-specific packages (e.g., `@dash0/sdk-expo`, `@dash0/sdk-react-native`, `@dash0/sdk-node`) while maintaining a consistent telemetry foundation.

## Table of Contents

- [Current State Analysis](#current-state-analysis)
- [Architecture Overview](#architecture-overview)
- [Package Structure](#package-structure)
- [Core Package (`@dash0/sdk-core`)](#core-package-dash0sdk-core)
- [Web Package (`@dash0/sdk-web`)](#web-package-dash0sdk-web)
- [Abstraction Strategy](#abstraction-strategy)
- [Migration Plan](#migration-plan)
- [Future Extensibility](#future-extensibility)
- [Testing Strategy](#testing-strategy)
- [Breaking Changes & Versioning](#breaking-changes--versioning)

---

## Current State Analysis

### Browser-Specific Dependencies

The current codebase has the following browser-specific dependencies:

1. **Global Objects** (`src/utils/globals.ts`):

   - `window`, `document`, `navigator`, `location`
   - `performance` API
   - `fetch` API
   - `localStorage`, `sessionStorage`
   - `sendBeacon` API

2. **Transport Layer** (`src/transport/fetch.ts`):

   - Browser `fetch` API
   - `CompressionStream` API (gzip compression)
   - `Blob` API
   - `URL` API

3. **Browser-Specific Instrumentations**:

   - **Web Vitals** (`src/instrumentations/web-vitals.ts`): LCP, INP, CLS metrics
   - **Error Tracking** (`src/instrumentations/errors/`): `window.onerror`, unhandled promise rejections
   - **Fetch Instrumentation** (`src/instrumentations/http/fetch.ts`): Wraps browser `fetch`
   - **Navigation** (`src/instrumentations/navigation/`): History API, page load/transition events
   - **Event Handlers** (`src/instrumentations/errors/event-handlers.ts`): DOM event wrapping
   - **Timers** (`src/instrumentations/errors/timers.ts`): `setTimeout`/`setInterval` wrapping

4. **Initialization Logic** (`src/api/init.ts`):
   - Browser environment detection (`isClient()`, `isSupported()`)
   - Browser-specific initialization

### Platform-Agnostic Core Logic

The following components are platform-agnostic:

1. **OTLP Data Structures** (`src/types/otlp.ts`):

   - All OpenTelemetry Protocol types
   - `Span`, `LogRecord`, `Resource`, `KeyValue`, etc.

2. **ID Generation** (`src/utils/id.ts`, `src/utils/trace-id.ts`, `src/utils/span-id.ts`):

   - Trace ID generation
   - Span ID generation
   - Unique ID generation (uses `Math.random()`)

3. **Span Management** (`src/utils/otel/span.ts`):

   - `startSpan()`, `endSpan()`, `addSpanEvent()`, `setSpanStatus()`
   - All span lifecycle management

4. **Attribute Management** (`src/utils/otel/attributes.ts`):

   - `addAttribute()`, `addAttributes()`
   - Attribute handling logic

5. **Batching Logic** (`src/transport/batcher.ts`):

   - Batching mechanism for logs and spans
   - Rate limiting (`src/utils/rate-limit.ts`)

6. **Time Utilities** (`src/utils/time.ts`):

   - Timestamp generation
   - Time conversion utilities

7. **Core Utilities**:
   - Object manipulation (`src/utils/obj.ts`)
   - Math utilities (`src/utils/math.ts`)
   - Function utilities (`src/utils/fn.ts`)
   - Debug utilities (core logic, not output mechanism)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│              (User's Web App, React Native App, etc.)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Platform-Specific SDK Package                   │
│    (@dash0/sdk-web, @dash0/sdk-expo, @dash0/sdk-rn)        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • Platform Detection & Initialization                │  │
│  │  • Platform-Specific Instrumentations                 │  │
│  │  • Platform-Specific Transport (fetch, XHR, etc.)     │  │
│  │  • Platform-Specific Event Handling                   │  │
│  │  • Platform-Specific Storage (localStorage, etc.)     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core SDK Package                          │
│                    (@dash0/sdk-core)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • OTLP Types & Data Structures                       │  │
│  │  • Span/Log Creation & Management                     │  │
│  │  • Trace/Span ID Generation                           │  │
│  │  • Attribute Management                               │  │
│  │  • Batching & Rate Limiting                           │  │
│  │  • Configuration Management                           │  │
│  │  • Abstract Interfaces (Transport, Storage, etc.)     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Dash0 Backend                            │
│                  (OTLP HTTP Endpoints)                       │
└─────────────────────────────────────────────────────────────┘
```

### Dependency Injection Pattern

The core package will define abstract interfaces that platform-specific packages must implement:

```typescript
// Core defines interfaces
interface PlatformAdapter {
  transport: TransportAdapter;
  storage: StorageAdapter;
  timing: TimingAdapter;
  environment: EnvironmentAdapter;
}

// Web package provides implementations
class BrowserPlatformAdapter implements PlatformAdapter {
  transport = new FetchTransport();
  storage = new LocalStorageAdapter();
  timing = new PerformanceTimingAdapter();
  environment = new BrowserEnvironmentAdapter();
}
```

---

## Package Structure

### Monorepo Structure (Using Nx)

```
dash0-sdk/
├── packages/
│   ├── core/                          # @dash0/sdk-core
│   │   ├── src/
│   │   │   ├── types/                 # OTLP types, options, interfaces
│   │   │   │   ├── otlp.ts
│   │   │   │   ├── options.ts
│   │   │   │   └── platform.ts        # Platform adapter interfaces
│   │   │   ├── telemetry/             # Core telemetry logic
│   │   │   │   ├── span.ts
│   │   │   │   ├── log.ts
│   │   │   │   └── attributes.ts
│   │   │   ├── transport/             # Abstract transport layer
│   │   │   │   ├── batcher.ts
│   │   │   │   ├── rate-limiter.ts
│   │   │   │   └── transport.ts       # Abstract interface
│   │   │   ├── utils/                 # Platform-agnostic utilities
│   │   │   │   ├── id.ts
│   │   │   │   ├── trace-id.ts
│   │   │   │   ├── span-id.ts
│   │   │   │   ├── time.ts
│   │   │   │   ├── math.ts
│   │   │   │   └── obj.ts
│   │   │   ├── config/                # Configuration management
│   │   │   │   └── vars.ts
│   │   │   ├── api/                   # Core API (platform-agnostic)
│   │   │   │   └── core-api.ts
│   │   │   └── index.ts               # Public exports
│   │   ├── package.json
│   │   ├── project.json               # Nx project configuration
│   │   ├── tsconfig.json
│   │   ├── tsconfig.lib.json
│   │   └── README.md
│   │
│   └── web/                           # @dash0/sdk-web
│       ├── src/
│       │   ├── platform/              # Browser platform adapter
│       │   │   ├── adapter.ts
│       │   │   ├── globals.ts
│       │   │   ├── transport.ts       # Fetch implementation
│       │   │   ├── storage.ts         # localStorage implementation
│       │   │   └── timing.ts          # Performance API wrapper
│       │   ├── instrumentations/      # Browser instrumentations
│       │   │   ├── web-vitals.ts
│       │   │   ├── fetch.ts
│       │   │   ├── navigation/
│       │   │   └── errors/
│       │   ├── attributes/            # Browser-specific attributes
│       │   │   ├── url.ts
│       │   │   └── common.ts
│       │   ├── api/                   # Web-specific API
│       │   │   ├── init.ts
│       │   │   ├── identify.ts
│       │   │   ├── events.ts
│       │   │   └── report-error.ts
│       │   ├── entrypoint/            # Entry points
│       │   │   ├── npm-package.ts
│       │   │   └── script.ts
│       │   └── index.ts               # Public exports
│       ├── package.json
│       ├── project.json               # Nx project configuration
│       ├── tsconfig.json
│       ├── tsconfig.lib.json
│       └── README.md
│
├── nx.json                            # Nx workspace configuration
├── pnpm-workspace.yaml                # pnpm workspace (used by Nx)
├── package.json                       # Root package.json with Nx
├── tsconfig.base.json                 # Base TypeScript config
└── README.md
```

### Nx Configuration Benefits

Using Nx provides several advantages:

1. **Task Orchestration**: Automatically runs tasks in the correct order based on dependencies
2. **Computation Caching**: Caches build outputs and test results locally and remotely
3. **Dependency Graph**: Visualize and understand project dependencies
4. **Affected Commands**: Only build/test what changed
5. **Code Generators**: Scaffold new packages consistently
6. **Plugin Ecosystem**: Rich ecosystem of plugins for different tools

### Nx Configuration Examples

#### Root `nx.json`

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production", "{workspaceRoot}/vitest.config.ts"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "{workspaceRoot}/eslint.config.js"]
    },
    "e2e": {
      "cache": true,
      "inputs": ["default", "^production"]
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
      "!{projectRoot}/tsconfig.spec.json"
    ],
    "sharedGlobals": ["{workspaceRoot}/tsconfig.base.json"]
  },
  "plugins": [
    {
      "plugin": "@nx/js/plugin",
      "options": {
        "buildTargetName": "build",
        "testTargetName": "test"
      }
    }
  ],
  "defaultBase": "main"
}
```

#### Core Package `project.json`

```json
{
  "name": "core",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/core/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/rollup:rollup",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "packages/core/dist",
        "main": "packages/core/src/index.ts",
        "tsConfig": "packages/core/tsconfig.lib.json",
        "project": "packages/core/package.json",
        "format": ["cjs", "esm"],
        "compiler": "tsc",
        "generateExportsField": true,
        "external": ["all"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{projectRoot}/coverage"],
      "options": {
        "passWithNoTests": true,
        "reportsDirectory": "../../coverage/packages/core"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/core/**/*.ts"]
      }
    }
  },
  "tags": ["type:core", "scope:shared"]
}
```

#### Web Package `project.json`

```json
{
  "name": "web",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/web/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/rollup:rollup",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "packages/web/dist",
        "main": "packages/web/src/index.ts",
        "tsConfig": "packages/web/tsconfig.lib.json",
        "project": "packages/web/package.json",
        "format": ["cjs", "esm", "umd"],
        "compiler": "babel",
        "generateExportsField": true,
        "external": ["@dash0/sdk-core"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{projectRoot}/coverage"],
      "options": {
        "passWithNoTests": true,
        "reportsDirectory": "../../coverage/packages/web"
      }
    },
    "e2e": {
      "executor": "nx:run-commands",
      "options": {
        "command": "wdio run ./packages/web/test/e2e/wdio.conf.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["packages/web/**/*.ts"]
      }
    }
  },
  "tags": ["type:platform", "scope:web"],
  "implicitDependencies": ["core"]
}
```

### Common Nx Commands

```bash
# Build all packages
nx run-many -t build

# Build only what changed (affected)
nx affected -t build

# Build with dependencies
nx build web  # Automatically builds core first

# Test all packages
nx run-many -t test

# Test only affected
nx affected -t test

# Run E2E tests for web
nx e2e web

# Lint all packages
nx run-many -t lint

# View dependency graph
nx graph

# Clear cache
nx reset

# Run multiple targets in parallel
nx run-many -t build,test,lint --parallel=3

# Build and watch for changes
nx watch --all -- nx build core
```

### CI/CD Integration

Example GitHub Actions workflow using Nx:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Derive appropriate SHAs for base and head
        uses: nrwl/nx-set-shas@v4

      - name: Run affected lint
        run: npx nx affected -t lint --parallel=3

      - name: Run affected test
        run: npx nx affected -t test --parallel=3 --coverage

      - name: Run affected build
        run: npx nx affected -t build --parallel=3

      - name: Run affected e2e
        run: npx nx affected -t e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./coverage
```

---

## Core Package (`@dash0/sdk-core`)

### Purpose

Provide platform-agnostic telemetry functionality that can be used across web, mobile, and server environments.

### Key Components

#### 1. Platform Adapter Interfaces

**File**: `packages/core/src/types/platform.ts`

```typescript
export interface TransportAdapter {
  /**
   * Send data to telemetry endpoints
   * @param path - API path (e.g., "/v1/logs", "/v1/traces")
   * @param body - Serializable data to send
   * @returns Promise that resolves when send completes
   */
  send(path: string, body: unknown): Promise<void>;

  /**
   * Check if transport is available/supported
   */
  isSupported(): boolean;
}

export interface StorageAdapter {
  /**
   * Get item from storage
   */
  getItem(key: string): string | null;

  /**
   * Set item in storage
   */
  setItem(key: string, value: string): void;

  /**
   * Remove item from storage
   */
  removeItem(key: string): void;

  /**
   * Check if storage is available
   */
  isAvailable(): boolean;
}

export interface TimingAdapter {
  /**
   * Get current timestamp in nanoseconds
   */
  nowNanos(): string;

  /**
   * Get current timestamp in milliseconds
   */
  nowMillis(): number;

  /**
   * Check if timing APIs are available
   */
  isSupported(): boolean;
}

export interface EnvironmentAdapter {
  /**
   * Check if running in a supported environment
   */
  isSupported(): boolean;

  /**
   * Get user agent string (if available)
   */
  getUserAgent(): string | undefined;

  /**
   * Get platform name (e.g., "web", "expo", "react-native")
   */
  getPlatformName(): string;

  /**
   * Get platform version (if available)
   */
  getPlatformVersion(): string | undefined;
}

export interface PlatformAdapter {
  transport: TransportAdapter;
  storage: StorageAdapter;
  timing: TimingAdapter;
  environment: EnvironmentAdapter;
}
```

#### 2. Core Telemetry Logic

All OTLP-compliant telemetry logic:

- **Span Management**: `startSpan()`, `endSpan()`, `addSpanEvent()`, `setSpanStatus()`
- **Log Creation**: Creating `LogRecord` objects
- **Attribute Management**: `addAttribute()`, `addAttributes()`
- **ID Generation**: Trace IDs, Span IDs, Session IDs, Tab IDs

#### 3. Transport Layer (Abstract)

**File**: `packages/core/src/transport/index.ts`

```typescript
import { LogRecord, Span } from "../types/otlp";
import { TransportAdapter } from "../types/platform";

let transportAdapter: TransportAdapter | null = null;

export function setTransportAdapter(adapter: TransportAdapter) {
  transportAdapter = adapter;
}

export function sendLog(log: LogRecord): void {
  if (!transportAdapter) {
    throw new Error("Transport adapter not set");
  }
  // Use batching logic
  logBatcher.send(log);
}

export function sendSpan(span: Span): void {
  if (!transportAdapter) {
    throw new Error("Transport adapter not set");
  }
  // Use batching logic
  spanBatcher.send(span);
}

// Batching and rate limiting remain here
```

#### 4. Configuration Management

**File**: `packages/core/src/config/vars.ts`

Platform-agnostic configuration:

```typescript
export type CoreVars = {
  endpoints: Endpoint[];
  resource: Resource;
  scope: InstrumentationScope;
  signalAttributes: KeyValue[];
  ignoreUrls: RegExp[];
  ignoreErrorMessages: RegExp[];
  propagators?: PropagatorConfig[];
  headersToCapture: RegExp[];
};

export const coreVars: CoreVars = {
  endpoints: [],
  resource: { attributes: [] },
  scope: {
    name: "dash0-sdk-core",
    version: __sdkVersion,
    attributes: [],
  },
  signalAttributes: [],
  ignoreUrls: [],
  ignoreErrorMessages: [],
  headersToCapture: [],
};
```

#### 5. Core API

**File**: `packages/core/src/api/core-api.ts`

```typescript
export interface CoreInitOptions {
  endpoint: Endpoint | Endpoint[];
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  deploymentName?: string;
  deploymentId?: string;
  additionalSignalAttributes?: Record<string, AttributeValueType>;
  ignoreUrls?: RegExp[];
  ignoreErrorMessages?: RegExp[];
  propagators?: PropagatorConfig[];
  headersToCapture?: RegExp[];
  sessionInactivityTimeoutMillis?: number;
  sessionTerminationTimeoutMillis?: number;
}

export function initCore(opts: CoreInitOptions, platformAdapter: PlatformAdapter): void {
  // Validate options
  // Set platform adapter
  // Initialize core configuration
  // Initialize session tracking
}
```

### Public API Surface

**File**: `packages/core/src/index.ts`

```typescript
// Types
export * from "./types/otlp";
export * from "./types/platform";
export * from "./types/options";

// Core API
export * from "./api/core-api";

// Telemetry
export * from "./telemetry/span";
export * from "./telemetry/log";
export * from "./telemetry/attributes";

// Transport
export * from "./transport";

// Utils
export * from "./utils/id";
export * from "./utils/trace-id";
export * from "./utils/span-id";
export * from "./utils/time";

// Config
export * from "./config/vars";
```

---

## Web Package (`@dash0/sdk-web`)

### Purpose

Provide browser-specific implementation of the Dash0 SDK, using the core package for telemetry logic.

### Key Components

#### 1. Browser Platform Adapter

**File**: `packages/web/src/platform/adapter.ts`

```typescript
import { PlatformAdapter, TransportAdapter, StorageAdapter, TimingAdapter, EnvironmentAdapter } from "@dash0/sdk-core";
import { FetchTransport } from "./transport";
import { LocalStorageAdapter } from "./storage";
import { PerformanceTimingAdapter } from "./timing";
import { BrowserEnvironmentAdapter } from "./environment";

export class BrowserPlatformAdapter implements PlatformAdapter {
  public transport: TransportAdapter;
  public storage: StorageAdapter;
  public timing: TimingAdapter;
  public environment: EnvironmentAdapter;

  constructor() {
    this.transport = new FetchTransport();
    this.storage = new LocalStorageAdapter();
    this.timing = new PerformanceTimingAdapter();
    this.environment = new BrowserEnvironmentAdapter();
  }
}
```

#### 2. Browser Transport Implementation

**File**: `packages/web/src/platform/transport.ts`

```typescript
import { TransportAdapter } from "@dash0/sdk-core";
import { vars } from "./globals";

export class FetchTransport implements TransportAdapter {
  async send(path: string, body: unknown): Promise<void> {
    // Current fetch.ts implementation
    // Uses browser fetch, CompressionStream, Blob, etc.
  }

  isSupported(): boolean {
    return typeof fetch === "function";
  }
}
```

#### 3. Browser Storage Implementation

**File**: `packages/web/src/platform/storage.ts`

```typescript
import { StorageAdapter } from "@dash0/sdk-core";

export class LocalStorageAdapter implements StorageAdapter {
  private storage: Storage | null;

  constructor() {
    try {
      this.storage = window?.localStorage ?? null;
    } catch {
      this.storage = null;
    }
  }

  getItem(key: string): string | null {
    return this.storage?.getItem(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage?.setItem(key, value);
  }

  removeItem(key: string): void {
    this.storage?.removeItem(key);
  }

  isAvailable(): boolean {
    return this.storage !== null;
  }
}
```

#### 4. Browser Instrumentations

Browser-specific instrumentations remain in the web package:

- **Web Vitals** (`web-vitals.ts`)
- **Fetch Instrumentation** (`fetch.ts`)
- **Navigation** (`navigation/`)
- **Error Tracking** (`errors/`)

These instrumentations use the core telemetry APIs (`sendLog`, `sendSpan`) but implement browser-specific event handling.

#### 5. Web-Specific API

**File**: `packages/web/src/api/init.ts`

```typescript
import { initCore, CoreInitOptions, PlatformAdapter } from "@dash0/sdk-core";
import { BrowserPlatformAdapter } from "../platform/adapter";

export interface WebInitOptions extends CoreInitOptions {
  // Browser-specific options
  wrapEventHandlers?: boolean;
  wrapTimers?: boolean;
  maxWaitForResourceTimingsMillis?: number;
  maxToleranceForResourceTimingsMillis?: number;
  urlAttributeScrubber?: UrlAttributeScrubber;
  pageViewInstrumentation?: PageViewInstrumentationSettings;
  enableTransportCompression?: boolean;
  enabledInstrumentations?: InstrumentationName[];
}

let hasBeenInitialised = false;

export function init(opts: WebInitOptions): void {
  if (hasBeenInitialised) {
    return;
  }

  // Browser-specific checks
  if (!isClient()) {
    return;
  }

  if (!isSupported()) {
    return;
  }

  // Create platform adapter
  const platformAdapter = new BrowserPlatformAdapter();

  // Initialize core
  initCore(opts, platformAdapter);

  // Initialize browser-specific configuration
  initializeBrowserConfig(opts);

  // Start browser-specific instrumentations
  startInstrumentations(opts);

  hasBeenInitialised = true;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function isSupported(): boolean {
  const adapter = new BrowserPlatformAdapter();
  return adapter.transport.isSupported() && adapter.timing.isSupported() && adapter.environment.isSupported();
}
```

### Public API Surface

**File**: `packages/web/src/index.ts`

```typescript
// Re-export core types that users need
export type { AttributeValueType, AnyValue, PropagatorConfig, PropagatorType } from "@dash0/sdk-core";

// Web-specific API
export * from "./api/init";
export * from "./api/identify";
export * from "./api/debug";
export * from "./api/attributes";
export * from "./api/events";
export * from "./api/log-level";
export * from "./api/session";
export * from "./api/report-error";

// Web-specific types
export type { UrlAttributeScrubber, UrlAttributeRecord } from "./attributes/url";
export type { PageViewMeta, PageViewInstrumentationSettings } from "./types";
```

---

## Abstraction Strategy

### Phase 1: Create Core Package Structure

1. **Set up Nx monorepo**:

   - Install Nx: `pnpm add -Dw nx @nx/js @nx/rollup`
   - Initialize Nx: `nx init`
   - Configure `nx.json` with caching and task pipeline
   - Set up pnpm workspace configuration
   - Create `packages/core` directory
   - Create `packages/web` directory
   - Configure Nx project for core package
   - Configure Nx project for web package

2. **Extract platform-agnostic code to core**:

   - Move OTLP types
   - Move span/log management
   - Move ID generation utilities
   - Move batching and rate limiting
   - Move attribute management
   - Move time utilities
   - Move core configuration

3. **Define platform adapter interfaces**:
   - Create `TransportAdapter` interface
   - Create `StorageAdapter` interface
   - Create `TimingAdapter` interface
   - Create `EnvironmentAdapter` interface
   - Create `PlatformAdapter` interface

### Phase 2: Refactor Web Package

1. **Implement browser platform adapter**:

   - Create `BrowserPlatformAdapter`
   - Implement `FetchTransport`
   - Implement `LocalStorageAdapter`
   - Implement `PerformanceTimingAdapter`
   - Implement `BrowserEnvironmentAdapter`

2. **Move browser-specific code to web package**:

   - Keep instrumentations in web package
   - Keep browser globals in web package
   - Keep browser-specific utilities in web package

3. **Update web initialization**:
   - Use core `initCore()` function
   - Pass browser platform adapter
   - Initialize browser-specific instrumentations

### Phase 3: Update Dependencies and Build

1. **Update package.json files**:

   - Core package dependencies (minimal)
   - Web package depends on core
   - Update build scripts

2. **Update build configuration**:

   - Update TypeScript configurations
   - Update Rollup configuration
   - Ensure proper module exports

3. **Update tests**:
   - Move core tests to core package
   - Keep browser-specific tests in web package
   - Add integration tests

---

## Migration Plan

### Step-by-Step Implementation

#### Step 1: Set Up Nx Monorepo (Week 1)

1. Install Nx and related dependencies
2. Initialize Nx workspace configuration
3. Create pnpm workspace configuration
4. Create `packages/core` and `packages/web` directories
5. Set up package.json files for both packages
6. Configure Nx projects with `project.json` files
7. Set up TypeScript configurations (`tsconfig.base.json`, per-package configs)
8. Configure build scripts with Nx targets
9. Set up Nx caching strategy
10. Configure affected commands for CI/CD

#### Step 2: Extract Core Package (Week 2-3)

1. **Types**:

   - Move `src/types/otlp.ts` → `packages/core/src/types/otlp.ts`
   - Create `packages/core/src/types/platform.ts` with adapter interfaces
   - Move core option types

2. **Telemetry**:

   - Move `src/utils/otel/span.ts` → `packages/core/src/telemetry/span.ts`
   - Move `src/utils/otel/attributes.ts` → `packages/core/src/telemetry/attributes.ts`
   - Create log management module

3. **Utils**:

   - Move ID generation utils
   - Move time utils
   - Move math/obj utils
   - Keep platform-specific utils in web

4. **Transport**:

   - Create abstract transport interfaces
   - Move batching logic
   - Move rate limiting

5. **Configuration**:
   - Extract core configuration
   - Define core init options

#### Step 3: Implement Web Package (Week 3-4)

1. **Platform Adapter**:

   - Implement `BrowserPlatformAdapter`
   - Implement `FetchTransport`
   - Implement storage adapters
   - Implement timing adapters

2. **Instrumentations**:

   - Keep all instrumentations in web package
   - Update to use core telemetry APIs

3. **API**:
   - Update init function to use core
   - Update other API functions

#### Step 4: Testing and Validation (Week 4-5)

1. **Unit Tests**:

   - Test core package independently
   - Test web package with mocked platform adapter
   - Test real browser integration

2. **E2E Tests**:

   - Run existing E2E tests
   - Ensure no regression
   - Add new tests for platform adapter

3. **Documentation**:
   - Update README files
   - Create migration guide
   - Document platform adapter interface

#### Step 5: Release and Migration (Week 5-6)

1. **Release core package** (`@dash0/sdk-core@1.0.0`)
2. **Release web package** (`@dash0/sdk-web@1.0.0`)
3. **Update documentation**
4. **Provide migration guide for existing users**

---

## Future Extensibility

### Creating New Platform Packages

With this architecture, creating new platform packages becomes straightforward:

#### Example: `@dash0/sdk-expo`

```typescript
// packages/expo/src/platform/adapter.ts
import { PlatformAdapter } from "@dash0/sdk-core";
import { ExpoTransport } from "./transport";
import { AsyncStorageAdapter } from "./storage";
import { ExpoTimingAdapter } from "./timing";
import { ExpoEnvironmentAdapter } from "./environment";

export class ExpoPlatformAdapter implements PlatformAdapter {
  public transport = new ExpoTransport();
  public storage = new AsyncStorageAdapter();
  public timing = new ExpoTimingAdapter();
  public environment = new ExpoEnvironmentAdapter();
}

// packages/expo/src/api/init.ts
import { initCore, CoreInitOptions } from "@dash0/sdk-core";
import { ExpoPlatformAdapter } from "../platform/adapter";

export function init(opts: CoreInitOptions): void {
  const platformAdapter = new ExpoPlatformAdapter();
  initCore(opts, platformAdapter);
  // Initialize Expo-specific instrumentations
}
```

#### Example: `@dash0/sdk-react-native`

Similar structure to Expo but with React Native-specific implementations:

- Use React Native's `NetInfo` for network status
- Use React Native's `AsyncStorage` for storage
- Implement React Native-specific error tracking
- Implement React Native-specific performance monitoring

### Community Contributions

The clear separation makes it easy for the community to:

1. Create platform-specific packages (e.g., Node.js, Deno, Bun)
2. Contribute instrumentations for specific platforms
3. Extend existing packages with additional functionality

---

## Testing Strategy

### Core Package Testing

1. **Unit Tests**:

   - Test all telemetry functions independently
   - Test ID generation
   - Test batching and rate limiting
   - Test configuration management
   - Mock platform adapters for testing

2. **Integration Tests**:
   - Test with real platform adapter implementations
   - Test end-to-end data flow

### Web Package Testing

1. **Unit Tests**:

   - Test browser platform adapter
   - Test each instrumentation
   - Test browser-specific utilities

2. **E2E Tests** (existing):

   - Page load tests
   - Fetch instrumentation tests
   - Web vitals tests
   - Error instrumentation tests
   - Navigation tests

3. **Browser Compatibility**:
   - Test across different browsers
   - Test with and without certain APIs available

---

## Breaking Changes & Versioning

### Breaking Changes

1. **Package Name Change**:

   - Users will need to install both `@dash0/sdk-core` and `@dash0/sdk-web`
   - Or just `@dash0/sdk-web` (which depends on core)

2. **Import Changes** (Minimal):

   - Most imports remain the same
   - Types are re-exported from web package

3. **API Changes** (Minimal):
   - The public API should remain largely unchanged
   - Internal APIs may change significantly

### Versioning Strategy

1. **Initial Release**:

   - `@dash0/sdk-core@1.0.0`
   - `@dash0/sdk-web@1.0.0`

2. **Dependency Management**:

   - Web package specifies minimum core version
   - Core package is backward compatible within major version

3. **Future Releases**:
   - Core and web can be versioned independently
   - Breaking changes in core require major version bump
   - Breaking changes in web may not require core changes

### Migration Guide for Users

Most users won't need to change anything:

**Before**:

```typescript
import { init } from "@dash0/sdk-web";

init({
  endpoint: { url: "...", authToken: "..." },
  serviceName: "my-app",
});
```

**After**:

```typescript
// Same import, same API
import { init } from "@dash0/sdk-web";

init({
  endpoint: { url: "...", authToken: "..." },
  serviceName: "my-app",
});
```

The only change is that `@dash0/sdk-web` now depends on `@dash0/sdk-core`, but this is transparent to users.

---

## Implementation Checklist

### Monorepo Setup

- [ ] Install Nx and related plugins (`nx`, `@nx/js`, `@nx/rollup`)
- [ ] Initialize Nx workspace with `nx init`
- [ ] Create `nx.json` configuration
- [ ] Create `pnpm-workspace.yaml`
- [ ] Set up `tsconfig.base.json`
- [ ] Configure Nx caching and task pipeline

### Core Package Setup

- [ ] Set up `packages/core` directory structure
- [ ] Create core `package.json` with dependencies
- [ ] Create core `project.json` with Nx targets
- [ ] Set up TypeScript configuration for core
- [ ] Configure build target in `project.json`
- [ ] Configure test target in `project.json`
- [ ] Configure lint target in `project.json`

### Core Package Implementation

- [ ] Define platform adapter interfaces
- [ ] Move OTLP types to core
- [ ] Move span management to core
- [ ] Move log management to core
- [ ] Move attribute management to core
- [ ] Move ID generation utilities to core
- [ ] Move time utilities to core
- [ ] Implement abstract transport layer
- [ ] Move batching logic to core
- [ ] Move rate limiting to core
- [ ] Create core configuration management
- [ ] Create core initialization function
- [ ] Set up core package exports

### Web Package Setup

- [ ] Set up `packages/web` directory structure
- [ ] Create web `package.json` with core dependency
- [ ] Create web `project.json` with Nx targets
- [ ] Set up TypeScript configuration for web
- [ ] Configure build target in `project.json`
- [ ] Configure test target in `project.json`
- [ ] Configure lint target in `project.json`
- [ ] Set up implicit dependencies on core package

### Web Package Implementation

- [ ] Implement BrowserPlatformAdapter
- [ ] Implement FetchTransport
- [ ] Implement LocalStorageAdapter
- [ ] Implement SessionStorageAdapter
- [ ] Implement PerformanceTimingAdapter
- [ ] Implement BrowserEnvironmentAdapter
- [ ] Move browser globals to web package
- [ ] Update web vitals instrumentation
- [ ] Update fetch instrumentation
- [ ] Update error instrumentations
- [ ] Update navigation instrumentations
- [ ] Update web initialization function
- [ ] Update web API functions
- [ ] Set up web package exports

### Testing

- [ ] Set up test infrastructure for core
- [ ] Write unit tests for core telemetry
- [ ] Write unit tests for core utilities
- [ ] Set up test infrastructure for web
- [ ] Write unit tests for platform adapter
- [ ] Write unit tests for web instrumentations
- [ ] Update existing E2E tests
- [ ] Add integration tests
- [ ] Test browser compatibility

### Documentation

- [ ] Write core package README
- [ ] Write web package README
- [ ] Document platform adapter interface
- [ ] Create migration guide
- [ ] Update main README
- [ ] Document breaking changes
- [ ] Create examples for new structure

### Release

- [ ] Finalize version numbers
- [ ] Create release notes
- [ ] Publish core package
- [ ] Publish web package
- [ ] Update documentation site
- [ ] Communicate changes to users

---

## Conclusion

This abstraction plan provides a clear path to separating the core telemetry logic from browser-specific implementation. The resulting architecture will:

1. **Enable multi-platform support**: Easily create packages for React Native, Expo, Node.js, etc.
2. **Improve maintainability**: Clear separation of concerns
3. **Facilitate community contributions**: Well-defined interfaces for extensions
4. **Maintain backward compatibility**: Minimal breaking changes for users
5. **Future-proof the codebase**: Flexible architecture for future enhancements

The key to success is the platform adapter interface, which provides a clean abstraction layer between core telemetry logic and platform-specific implementations. This design pattern is proven and widely used in similar SDKs (e.g., OpenTelemetry, Sentry).
