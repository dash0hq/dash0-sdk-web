import { newBatcher } from "./batcher";
import { send, SendOptions } from "./fetch";
import { vars } from "../vars";
import { debug, error, createRateLimiter } from "../utils";
import { ExportLogsServiceRequest, ExportTraceServiceRequest, LogRecord, Span } from "../types/otlp";

const logBatcher = newBatcher<LogRecord>(sendLogs);
const spanBatcher = newBatcher<Span>(sendSpans);

let rateLimiter: (() => boolean) | undefined;
let sessionRecordingRateLimiter: (() => boolean) | undefined;

function isRateLimited() {
  if (!rateLimiter) {
    rateLimiter = createRateLimiter({
      maxCallsPerTenMinutes: 4096,
      maxCallsPerTenSeconds: 128,
    });
  }

  return rateLimiter();
}

// Session recording chunks get their own budget. They are large and periodic, and must neither consume the
// shared budget of spans and logs nor be starved by it.
function isSessionRecordingRateLimited() {
  if (!sessionRecordingRateLimiter) {
    sessionRecordingRateLimiter = createRateLimiter({
      maxCallsPerTenMinutes: 256,
      maxCallsPerTenSeconds: 8,
    });
  }

  return sessionRecordingRateLimiter();
}

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
 */
export function sendSessionRecordingChunk(log: LogRecord): void {
  if (!vars.isSessionSampled) return;

  if (isSessionRecordingRateLimited()) {
    debug("Session recording rate limit. Will not send chunk.", log);
    return;
  }

  sendLogs([log], { compress: true });
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
