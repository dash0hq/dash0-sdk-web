import { newBatcher } from "./batcher";
import { send, SendOptions } from "./fetch";
import { vars } from "../vars";
import { debug, error, createRateLimiter } from "../utils";
import { ExportLogsServiceRequest, ExportTraceServiceRequest, LogRecord, Span } from "../types/otlp";

const logBatcher = newBatcher<LogRecord>(sendLogs);
const spanBatcher = newBatcher<Span>(sendSpans);

/**
 * Returns an `isRateLimited()` check whose limiter is created on first use, so the module can be imported
 * without touching timers.
 */
function lazyRateLimiter(opts: Parameters<typeof createRateLimiter>[0]): () => boolean {
  let limiter: (() => boolean) | undefined;
  return () => {
    if (!limiter) {
      limiter = createRateLimiter(opts);
    }
    return limiter();
  };
}

const isRateLimited = lazyRateLimiter({
  maxCallsPerTenMinutes: 4096,
  maxCallsPerTenSeconds: 128,
});

// Session recording chunks get their own budget. They are large and periodic, and must neither consume the
// shared budget of spans and logs nor be starved by it. The budget is deliberately generous: every chunk
// depends on the ones before it, so a dropped chunk makes the replay unrenderable until the next full snapshot
// (`checkoutEveryNms`). At the default `chunkMaxBytes` of 48 KB, 64 chunks per 10 s allow a ~3 MB mutation
// burst (a heavy first render), and 512 per 10 min cap a runaway page at ~25 MB of uncompressed replay JSON.
const isSessionRecordingRateLimited = lazyRateLimiter({
  maxCallsPerTenMinutes: 512,
  maxCallsPerTenSeconds: 64,
});

export function sendLog(log: LogRecord): void {
  if (!vars.isSessionSampled) return;

  if (isRateLimited()) {
    debug("Transport rate limit. Will not send item.", log);
    return;
  }

  logBatcher.send(log);
}

/**
 * Transmits a session recording chunk as a single log record. Chunks bypass the log batcher: batching 15 chunks
 * of up to `chunkMaxBytes` each would produce requests far beyond the keepalive body limit.
 *
 * Chunks are gzipped by default because replay JSON compresses roughly 8:1. Pass `compress: false` when the
 * request must be issued synchronously, i.e. while the document is being unloaded: compression is asynchronous
 * and the page may be gone before `fetch()` is ever called.
 */
export function sendSessionRecordingChunk(log: LogRecord, opts?: SendOptions): void {
  if (!vars.isSessionSampled) return;

  if (isSessionRecordingRateLimited()) {
    debug("Session recording rate limit. Will not send chunk.", log);
    return;
  }

  sendLogs([log], { compress: opts?.compress ?? true });
}

function sendLogs(logs: LogRecord[], opts?: SendOptions): void {
  send(
    "/v1/logs",
    {
      resourceLogs: [
        {
          resource: vars.resource,
          scopeLogs: [
            {
              scope: vars.scope,
              logRecords: logs,
            },
          ],
        },
      ],
    } satisfies ExportLogsServiceRequest,
    opts
  ).catch((err) => {
    error("Failed to transmit logs", err);
  });
}

export function sendSpan(span: Span | undefined): void {
  if (!span) return;
  if (!vars.isSessionSampled) return;

  if (isRateLimited()) {
    debug("Transport rate limit. Will not send item.", span);
    return;
  }

  spanBatcher.send(span);
}

function sendSpans(spans: Span[]): void {
  send("/v1/traces", {
    resourceSpans: [
      {
        resource: vars.resource,
        scopeSpans: [
          {
            scope: vars.scope,
            spans: spans,
          },
        ],
      },
    ],
  } satisfies ExportTraceServiceRequest).catch((err) => {
    error("Failed to transmit spans", err);
  });
}
