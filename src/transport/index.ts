import { ExportLogsServiceRequest, ExportTraceServiceRequest, LogRecord, Span } from "../../types/otlp";
import { newBatcher } from "./batcher";
import { addCommonSignalAttributes } from "../add-common-signal-attributes";
import { send } from "./fetch";
import { vars } from "../vars";
import { createRateLimiter } from "../utils/rate-limit";
import { debug, error } from "../utils";

const logBatcher = newBatcher<LogRecord>(sendLogs);
const spanBatcher = newBatcher<Span>(sendSpans);

const isRateLimited = createRateLimiter({
  maxCalls: 8096,
  maxCallsPerTenMinutes: 4096,
  maxCallsPerTenSeconds: 128,
});

export function sendLog(log: LogRecord): void {
  if (isRateLimited()) {
    debug("Transport rate limit. Will not send item.", log);
    return;
  }

  addCommonSignalAttributes(log.attributes);
  logBatcher.send(log);
}

function sendLogs(logs: LogRecord[]): void {
  send("/v1/logs", {
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
  } satisfies ExportLogsServiceRequest).catch((err) => {
    error("Failed to transmit logs", err);
  });
}

export function sendSpan(span: Span): void {
  if (isRateLimited()) {
    debug("Transport rate limit. Will not send item.", span);
    return;
  }

  addCommonSignalAttributes(span.attributes);
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
