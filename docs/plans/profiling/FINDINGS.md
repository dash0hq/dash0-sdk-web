# Browser profiling: findings

Findings from building `@dash0/profiling`, which sends JS Self-Profiling samples as OTLP profiles.

## OTLP Profiles version

The encoder is generated from [opentelemetry-proto v1.11.0](https://github.com/open-telemetry/opentelemetry-proto/tree/v1.11.0/opentelemetry/proto/profiles/v1development)
(`profiles/v1development`), vendored under `proto/`. Run `pnpm gen:proto` to regenerate it.

How it was chosen:

- The target is `go.opentelemetry.io/collector/pdata` v1.66.0 to v1.69.0, which recent OpenTelemetry Collector
  releases use to read profiles.
- pdata v1.66.0 and v1.67.0 depend on `go.opentelemetry.io/proto/slim/otlp` v1.11.0; pdata v1.69.0 on v1.11.1
  (see `go.mod` of each pdata release).
- Those opentelemetry-proto-go releases pin the opentelemetry-proto submodule to the commits tagged
  [v1.11.0](https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.0) and
  [v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.1).
- [v1.11.0...v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/compare/v1.11.0...v1.11.1) changes only
  comments in the profiles protos, so both are the same on the wire. v1.10.0 to v1.11.0 changed the schema.

The profile type matches the OpenTelemetry eBPF profiler: sample type `samples`/`count`, period type
`cpu`/`nanoseconds`.

## Ingress

Tested end to end against a non-production Dash0 environment. Every profile was accepted, and Dash0's profiling
queries returned the right function names, lines and frame type (`v8js`). The sample counts matched: the example
page sent 16 samples, and Dash0 returned 160 ms of self time at a 10 ms period. Production ingestion was not tested.

## A larger React app

A Next.js app with React, run as a development build, sent its profiles through this build after adding the
`Document-Policy: js-profiling` header in `next.config`. In one 44 minute window it sent 56 chunks, all accepted,
with 6753 samples with a stack and 46,289 idle samples. Dash0 returned 67,530 ms of self time, which is 6753
samples at 10 ms, so idle samples do not count as CPU. Telemetry > Profiling drew the flame graph.

Filtering on `page.url.path` returned only that page's samples, and a value that was never sent returned nothing.
Each page had different top app functions, which the merged view hides.

What makes the merged view hard to use:

- About 80% of self time is in React's commit phase. While React commits, no app frame is on the stack, so no
  sampling profiler can name the component that caused the work. A development build inflates React; a production
  build was not measured.
- Without a page or session filter, all pages are merged into one flame graph.
- Production builds are minified. The SDK's own frames already show names like `vo`.

## Payload size per chunk

Headless Chrome 156 on macOS, example page, 10 ms requested interval (Chrome reported 10 ms), 15 s chunks.

| Page                                    | Samples with a stack | Idle samples | Stacks   | Protobuf      | Gzip   | OTLP/JSON (estimate) |
| --------------------------------------- | -------------------- | ------------ | -------- | ------------- | ------ | -------------------- |
| Busy, about half the time in JavaScript | 235 to 242           | 995 to 1022  | 22 to 24 | 3.2 to 3.3 KB | 2.0 KB | 11.9 to 13.3 KB      |
| Mostly idle, 10 ms of work every 260 ms | 11 to 13             | 1160 to 1175 | 4 to 6   | 0.9 to 1.0 KB | 0.7 KB | not measured         |

The JSON column is the decoded request serialized with int64 as strings and bytes as base64, an approximation of
OTLP/JSON. Protobuf is about 4 times smaller. Chunks sent while the page hides or unloads are not compressed, and
stayed under 2 KB in these runs, far below the 60 KB keepalive budget.

## Bundle size

Built with `pnpm build`, gzip sizes from `build:stats`.

| Bundle                     | Before                | After                 |
| -------------------------- | --------------------- | --------------------- |
| `dash0.js`                 | 89.0 kB, 27.3 kB gzip | 91.5 kB, 28.2 kB gzip |
| `dash0.iife.js`            | 89.4 kB, 27.5 kB gzip | 91.9 kB, 28.3 kB gzip |
| `dash0-profiling.js` (new) |                       | 20.2 kB, 5.5 kB gzip  |

The main bundle grows by 0.9 kB gzip for the controller, which runs only when profiling is enabled. The encoder and
`@bufbuild/protobuf` are only in the profiling bundle; `scripts/verify-bundles.mjs` fails the build otherwise.

## Overhead

Example page, 400 rounds of `fibonacci(25)`, a 50 000 element sort and a JSON round trip, no idle time, five runs
each, alternating.

| Profiling | Mean total time of the work | Range           |
| --------- | --------------------------- | --------------- |
| On        | 2453 ms                     | 2420 to 2481 ms |
| Off       | 2449 ms                     | 2414 to 2493 ms |

The difference (0.2%) is smaller than the spread between runs. Encoding one 15 s chunk of a busy page (1250
samples, 60 stacks) takes about 0.1 ms in Node 24.

With Chrome's CPU throttling, same page and work, five runs each, alternating:

| Throttling | Profiling | Median total time | Range               |
| ---------- | --------- | ----------------- | ------------------- |
| 4x         | On        | 9503 ms           | 9478 to 10,025 ms   |
| 4x         | Off       | 9569 ms           | 9491 to 9770 ms     |
| 6x         | On        | 14,831 ms         | 14,466 to 15,150 ms |
| 6x         | Off       | 14,796 ms         | 14,459 to 15,365 ms |

The difference stays inside the spread between runs. Main thread time of each step, measured in the page:

| Step                                     | 4x            | 6x            |
| ---------------------------------------- | ------------- | ------------- |
| `new Profiler()`                         | 0.1 to 0.8 ms | 0.2 to 1.3 ms |
| `stop()` until it returns                | 1.4 to 1.5 ms | 1.6 to 2.2 ms |
| Encoding a 15 s chunk (about 400 stacks) | 2.8 to 8.9 ms | 3.5 to 9.9 ms |

Encoding is the one step above 5 ms, and the first chunk of a page is the slowest. It runs once per chunk, in the
promise callback after `stop()`. Running it in an idle callback or a worker would take it off the input path; this
was not done.

## Manual test

1. `pnpm build`, then `pnpm sink`, then open http://localhost:4318/examples/profiling/ in Chrome. The sink prints
   one `PROF` line per chunk with the top functions.
2. To send to Dash0 instead, change `endpoint` in `examples/profiling/index.html` to the ingress URL, a token with
   `ingest:profiles`, and a dev dataset. Keep the page on `localhost:4318` for the header.
3. In Dash0, open Telemetry > Profiling for the dataset and the `profiling-example` service. Check that
   `fibonacci`, `sortNumbers` and `buildAndParseJson` appear, and that the sample count matches the sink.

## Attributes

A profile carries the same attributes as web events, from the same code: `page.url.*` after `urlAttributeScrubber`,
`session.id`, `browser.tab.id`, `page.load.id`, the window size and the signal attributes the app sets. Apps that
call `identify()` therefore send user fields such as `user.email` on profiles too, as they do on web events.

The profiler runs for as long as the page is visible and starts a new chunk every 15 s. A chunk also ends on every
page view, so a profile never spans two pages and carries that page's URL. In the React app test, the chunks
followed client-side navigation, one URL per chunk. On the example page left open for 136 s, with a 300 ms function
run at 90 s, the profiler rotated 9 times, the chunk sent at 91 s held 29 samples, and Dash0 returned 280 ms of
self time for that function.

## Decisions

- Proposal: show app code first by dropping library frames from each stack, so a sample's time moves to the nearest
  app frame. A frame filter on source files containing `node_modules`, `next_dist`, `next/dist`, `react-dom` or
  `sdk-web` did this on the React app test. On one page the top function went from a React internal to the app's
  own animation code.
- This view hides most of the CPU. Samples with no app frame drop out, and on one page 1.4 s of 27.6 s stayed. The
  view has to say how much it hides, for example "1.4 s of 27.6 s shown", and should not be the default.
- Collapsing library frames is better than dropping them. Chrome DevTools replaces a run of ignore-listed frames
  with one entry ([DevTools](https://developer.chrome.com/blog/devtools-navigate-and-filter)), so library-only time
  stays visible as one bucket. Sentry colors app and library frames differently and hides neither
  ([Sentry](https://docs.sentry.io/product/explore/profiling/profile-details/)). The Firefox Profiler "JavaScript
  only" filter does drop samples
  ([Firefox Profiler](https://profiler.firefox.com/docs/#/./guide-filtering-call-trees)).
- Matching on file names only works on development builds. Production chunk URLs are hashed, and bundlers mix app
  and library code in one chunk. Frames have to be classified after source maps are applied: library code when the
  original path contains `node_modules` or the source map's `ignoreList` names it, with user rules on top, as in
  Sentry's [stack trace rules](https://docs.sentry.io/concepts/data-management/event-grouping/stack-trace-rules/).
- These numbers come from a development build, which inflates React. A production build was not measured.

## Open questions

For Dash0:

- Do browser profiles show up next to the website that sent them? The SDK sends the same resource as for web
  events, but it is not known whether Dash0 links them to the website.
- Source maps: frames from minified bundles carry minified names and positions. Profiles carry the file, line and
  column a source map lookup needs, the same inputs as error stack traces.
- Linking slow interactions to profiles: a slow INP or long animation frame event already has a `session.id` and a
  time, which is enough to open the matching profile with the filters that work today.
- Showing app code first: most self time lands in framework internals.
- Should idle samples be sent instead of counted? They are 80% or more of all samples even on a busy page.
- `dash0.profiling.idle_sample_count` is not in any semantic convention registry.

For the SDK:

- `page.url.*` is in no semantic convention registry. Profiles use it anyway, to match web events.
- On a busy page only about 20% of samples carry a stack, although the page spends about half its time in
  JavaScript. The cause is not known. Chrome 156 samples carry no field that tells idle time from time spent in
  rendering or garbage collection.
- `pagehide` flush depends on `Profiler.stop()`, which is asynchronous. It worked on navigation in these runs.
  Closing a tab was not tested.
- The script-tag build reads `window.dash0ProfileEncoder` once in `init`, so the profiling script must load first.
