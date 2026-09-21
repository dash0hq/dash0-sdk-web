# Session Recording (rrweb) for `@dash0/sdk-web`

> Implementation plan. Not part of the published SDK documentation — `docs/plans/` sits
> outside the `docs/sdk/*.md` coverage glob in
> `.github/workflows/sync-docs/transformations.yaml`, so this file is not synced to
> dash0.com/docs.

## Context

The SDK collects page views, web vitals, errors and HTTP spans, but there is no way to
see _what the user actually did_. Session recording closes that gap: a DOM-level replay
of the session, joinable to the traces and logs the SDK already emits.

Three constraints shape the design, all verified against the current tree:

1. **There is no "session trace".** No ambient span or context manager exists
   (`grep activeSpan|getActiveSpan` → nothing). What exists is
   `generateTraceId(sessionId)` (`src/utils/trace-id.ts:22`), which embeds the 8-byte
   session id _inside_ the trace id (`d042` + flags + session bytes + random). That is
   the SDK's session↔trace join mechanism, and it is what recording will use.
2. **Bundle size.** The SDK is 22 KB gzip. `@rrweb/record@2.1.1` resolves to a
   self-contained, dependency-free ESM bundle (`dist/record.js`, 162 KB raw /
   34.6 KB gzip unminified, ~24 KB after terser) with **zero runtime imports**. Bundling
   it inline would roughly double the SDK for every consumer, so it ships as a separate
   opt-in entrypoint.
3. **The existing log path cannot carry replay chunks.** `logBatcher` batches up to 15
   records per request (`src/transport/batcher.ts:6`) — 15 × 48 KB chunks would be a
   720 KB request — and the rate limiter (128/10s) is shared with spans.

**Outcome:** replay chunks arrive as OTLP log records with `event.name =
browser.session_recording`, each stamped with a recording-stream trace id that decodes
back to the session, so a replay can be opened from any span or log in that session.

## Design decisions (confirmed)

| Decision        | Choice                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Shipping        | Separate opt-in entrypoint (`@dash0/sdk-web/session-recording` + a second IIFE bundle). Main bundle unchanged.  |
| Correlation     | One `generateTraceId(sessionId)` / `generateSpanId(traceId)` pair per recording stream, stamped on every chunk. |
| Privacy default | `maskAllInputs: true`, text captured. rrweb masking options exposed for override.                               |
| Scope           | Continuous recording only, with its own sampling rate. No error-triggered buffer mode in v1.                    |

### Avoiding the duplicated-singleton hazard

A second bundle that re-bundled `vars`/`sessionId`/`transport` would give the script-tag
path **two copies of the `vars` singleton** — silently broken. The fix is to invert the
dependency: **the recording bundle contains only rrweb; the main SDK owns all Dash0
logic and receives the recorder as an injected function.**

`src/entrypoint/session-recording*.ts` must import **nothing** from `src/` except
`import type` (erased at compile time). Enforce with an eslint
`no-restricted-imports` override scoped to those two files, plus a post-build grep
asserting the recording bundle does not contain `d0_session`.

## Wire format

```
event.name                                    = "browser.session_recording"
severityNumber/Text                           = 9 / "INFO"
timeUnixNano                                  = timestamp of first event in the chunk
traceId                                       = generateTraceId(sessionId)   // per stream
spanId                                        = generateSpanId(traceId)      // per stream
body.stringValue                              = JSON.stringify(rrwebEvents)
attributes  (addCommonAttributes → session.id, browser.tab.id, page.load.id,
             page.url.*, window w/h, user.*, …)
  + dash0.session_recording.id                // 16-byte hex, one per stream
  + dash0.session_recording.seq               // int, 0-based, monotonic within stream
  + dash0.session_recording.event_count       // int
  + dash0.session_recording.has_snapshot      // bool, chunk contains an rrweb FullSnapshot (type 2)
  + dash0.session_recording.end_time_unix_nano// int64-as-string, last event in chunk
```

A stream = one recorder run (one page load / tab). SPA navigation does **not** start a
new stream — rrweb keeps recording; virtual page views remain separate `browser.page_view`
logs, correlatable by `page.load.id` + timestamp. Ordering within a session is
`(dash0.session_recording.id, seq)`.

## Implementation

### 1. Config surface

**`src/types/session-recording.ts`** (new) — structural types only, so no rrweb types
leak into the public API:

```ts
export type SessionRecorder = (options: {
  emit: (event: unknown, isCheckout?: boolean) => void;
  checkoutEveryNms?: number;
  maskAllInputs?: boolean;
  maskTextClass?: string | RegExp;
  maskTextSelector?: string;
  maskInputFn?: (text: string, element: HTMLElement | null) => string;
  maskTextFn?: (text: string, element: HTMLElement | null) => string;
  blockClass?: string | RegExp;
  blockSelector?: string;
  ignoreClass?: string;
  recordCanvas?: boolean;
  collectFonts?: boolean;
  inlineStylesheet?: boolean;
}) => (() => void) | undefined; // returns a stop fn
```

All option names verified present in `@rrweb/record@2.1.1/dist/record.js`. Note
`unmaskTextSelector` does **not** exist in 2.1.x; mask-all-text is `maskTextSelector: "*"`.

**`src/vars.ts`** — add `sessionRecording: SessionRecordingSettings` following the
`pageViewInstrumentation` precedent (TSDoc on each field; `init`'s `merge()` shallow-merges
nested objects, so partial overrides work):

```
samplingRate      100      // deterministic, reuses isSessionSampledIn(sessionId, rate)
maskAllInputs     true
maskTextSelector  undefined
blockClass        "dash0-block"
maskTextClass     "dash0-mask"
recordCanvas      false
collectFonts      false
chunkMaxBytes     48_000   // under BEACON_BODY_SIZE_LIMIT (60_000) so keepalive stays usable
chunkMaxMillis    5_000
checkoutEveryNms  300_000  // periodic FullSnapshot
```

**`src/types/options.ts`** — add `"@dash0/session-recording"` to `InstrumentationName`
and `"sessionRecording"` to the trailing `Partial<Pick<Vars, …>>`.

**`src/api/init.ts`** — add `"sessionRecording"` to the `pick(opts, [...])` array (L78-90),
and after the sampling early-return (L106-110) gate on
`isInstrumentationEnabled("@dash0/session-recording", opts)` before arming recording.

### 2. Recorder

**`src/instrumentations/session-recording/index.ts`** — lifecycle + a two-way handshake
so script load order does not matter:

- `registerRecorder(recorder)` — stores it; starts immediately if init already ran.
- `armSessionRecording()` — called from `init()`; starts immediately if a recorder was
  already registered.
- `start()` guards: already running · `!win` · `!vars.isSessionSampled` ·
  `!isSessionSampledIn(sessionId, vars.sessionRecording.samplingRate)` ·
  `isUrlIgnored(location.href)` (reuse `src/utils/ignore-rules.ts`).
- On start: `recordingId = generateUniqueId(TRACE_ID_BYTES)`,
  `traceId = generateTraceId(sessionId)`, `spanId = generateSpanId(traceId)`.
- Registers `onLastChance(flush)` (`src/utils/on-last-chance.ts`), wraps the whole thing
  in try/catch → `warn()`, never throws.
- `stop()` calls rrweb's returned stop fn and flushes.

Because `isSessionSampledIn` uses `crc32(sessionId) % 100` for both rates, recorded
sessions are a strict subset of telemetry-sampled ones — the desired behaviour.

**`src/instrumentations/session-recording/chunker.ts`** — buffers events; flushes on
`chunkMaxBytes`, `chunkMaxMillis` (via `setTimeout` from `src/utils/timers.ts`),
`isCheckout`, last chance, or `stop()`. Track a running byte estimate rather than
re-stringifying on every event. A single rrweb event (a FullSnapshot) can exceed
`chunkMaxBytes` on its own — emit it as a solo chunk and `debug()` it; events are not
splittable.

**`src/instrumentations/session-recording/log.ts`** — builds the `LogRecord` per the wire
format above using `addCommonAttributes` (`src/attributes/common.ts:25`) and `addAttribute`
(`src/utils/otel/attributes.ts:61`), mirroring `buildAndSendPageViewLog`
(`src/instrumentations/navigation/event.ts:33`).

### 3. Transport

**`src/transport/index.ts`** — new `sendSessionRecordingChunk(log: LogRecord)`: respects
`vars.isSessionSampled`, uses its **own** rate limiter
(`createRateLimiter({ maxCallsPerTenMinutes: 256, maxCallsPerTenSeconds: 8 })`) so replay
cannot starve spans/logs, and calls the existing private `sendLogs([log])` directly —
**bypassing `logBatcher`**, one chunk per request.

**`src/transport/fetch.ts`** — widen to `send(path, body, opts?: { compress?: boolean })`
so the recording path can request gzip even though `vars.enableTransportCompression`
defaults to `false`. Replay JSON compresses roughly 8:1; without this, recording is
needlessly expensive. Keep `CompressionStream` feature-detection as-is.

### 4. Public API

**`src/api/session-recording.ts`** (new) — `startSessionRecording(recorder?: SessionRecorder)`
and `stopSessionRecording()`. Falls back to `(win as any).dash0Recorder` when no recorder
is passed. Must never throw — an uncaught throw aborts the whole script-tag queue drain
(see the comment at `src/api/start-view.ts:45-51`).

- **`src/entrypoint/npm-package.ts`** — export both fns and `export type { SessionRecorder, SessionRecordingSettings }`.
- **`src/entrypoint/script.ts`** — add both to the `scriptApis` map (L16-27).

### 5. Build

**`src/entrypoint/session-recording.ts`** (new, npm subpath):

```ts
import { record } from "@rrweb/record";
import type { SessionRecorder } from "../types/session-recording";
export const recorder = record as unknown as SessionRecorder;
```

**`src/entrypoint/session-recording-script.ts`** (new, IIFE): assigns
`window.dash0Recorder = record` **and** calls `window.dash0("startSessionRecording", record)`.
The snippet's inline `_q` shim runs first in `<head>`, so the queued `init` is always
drained before this call regardless of which bundle finishes loading first.

**`rollup.config.mjs`** — two new configs → `dist/dash0-session-recording.js` (esm) and
`dist/dash0-session-recording.iife.js` (iife, name `dash0Recorder`). **Skip the babel
plugin for these two**: rrweb needs `Proxy`/`MutationObserver`, so the `ie 11` target is
pointless, and transpiling to ES5 inflates the bundle. rrweb's dist uses `??` (no
optional chaining, no class fields), which every browser in the e2e baseline supports
(Chrome 128, Firefox 119, Edge 133, Safari 16). Keep `nodeResolve` + `replace` + `terser`.

**`package.json`** — add `@rrweb/record: ^2.1.1` to `dependencies`, and:

```json
"./session-recording": {
  "types": "./dist/types/entrypoint/session-recording.d.ts",
  "default": "./dist/dash0-session-recording.js"
}
```

### 6. Tests

Unit (`*_test.ts`, colocated, `vi.mock("../../transport")` per `fetch_test.ts`):

- `chunker_test.ts` — flush on bytes / on time / on checkout / on last chance; `seq`
  monotonicity; oversized single event emitted alone.
- `log_test.ts` — asserts the full `KeyValue[]` and that `traceId`/`spanId` are stable
  across chunks of one stream (pattern: `src/attributes/url_test.ts`).
- `index_test.ts` — sampling gate, `isUrlIgnored` gate, both handshake orders
  (register→arm and arm→register), double-start is a no-op.

E2E: new `test/e2e/spec/10-session-recording/` with `page.html` (snippet + both IIFE
scripts + a button and a text input) and `10-session-recording.test.ts` using
`expectLogMatching` from `spec/expectations.ts` and `loadPage` from `spec/utils.ts`.
Assert: a `browser.session_recording` log arrives with `has_snapshot: true` and `seq: 0`;
its `traceId` starts with `d042` and contains the `session.id` attribute value at bytes
3-11; typing into the input does **not** put the typed text in any chunk body
(masking check); `seq` increments across chunks.

Add the spec to `test/e2e/spec/browser-compat.ts` if any baseline browser needs gating.

### 7. Docs

- `docs/sdk/configuration.md` — new `#### Session recording` section using the exact
  bullet template (`key:` / `type:` / `optional:` / `default:` + prose mirroring the
  `src/vars.ts` TSDoc), plus a privacy note documenting `dash0-block` / `dash0-mask` and
  `maskTextSelector: "*"`.
- `docs/sdk/api.md` — `#### startSessionRecording()` / `#### stopSessionRecording()`.
- `docs/sdk/setup.md` — the extra import / second script tag, and a CSP note (no new
  origins; the bundle is self-hosted alongside `dash0.iife.js`).
- No change needed to `.github/workflows/sync-docs/transformations.yaml` — sections are
  added to existing pages, not new files.

## Verification

```bash
pnpm run lint && pnpm run prettier:check
pnpm run test:unit
pnpm run build && ls -la dist/          # confirm the two new bundles exist
gzip -c dist/dash0.js | wc -c           # must stay ~22 KB — main bundle unchanged
gzip -c dist/dash0-session-recording.js | wc -c   # expect ~24-26 KB
grep -c d0_session dist/dash0-session-recording.js  # must be 0 (no SDK code leaked in)
pnpm run test:e2e:local
```

Then load `test/e2e/spec/10-session-recording/page.html` against the local test server,
interact with the page, and inspect `GET /otlp-requests` to confirm chunk bodies replay
in `seq` order and that masked input values are asterisked.

## Explicitly out of scope

- Error-triggered buffer mode (record continuously in memory, flush on error).
- `rrweb-packer` / fflate binary packing — transport gzip covers it for now.
- Canvas and font capture are wired but default off.
- Cross-tab stream stitching beyond `session.id` + `browser.tab.id`.
