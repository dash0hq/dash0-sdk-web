import {
  ExportLogsServiceRequest,
  ExportTraceServiceRequest,
  LogRecord,
  Span,
} from "../../types/otlp";
import { newBatcher } from "./batcher";
import { addCommonSignalAttributes } from "../add-common-signal-attributes";
import { send } from "./fetch";
import { vars } from "../vars";

const logBatcher = newBatcher<LogRecord>(sendLogs);
const spanBatcher = newBatcher<Span>(sendSpans);

export async function sendLog(log: LogRecord): Promise<void> {
  addCommonSignalAttributes(log.attributes);
  logBatcher.send(log);
}

async function sendLogs(logs: LogRecord[]): Promise<void> {
  await send('/v1/logs', {
    "resourceLogs": [
      {
        "resource": vars.resource,
        "scopeLogs": [
          {
            "scope": vars.scope,
            "logRecords": logs
          }
        ]
      }
    ]
  } satisfies ExportLogsServiceRequest);
}

export async function sendSpan(span: Span): Promise<void> {
  addCommonSignalAttributes(span.attributes);
  spanBatcher.send(span);
}

async function sendSpans(spans: Span[]): Promise<void> {
  await send('/v1/traces', {
    "resourceSpans": [
      {
        "resource": vars.resource,
        "scopeSpans": [
          {
            "scope": vars.scope,
            "spans": spans
          }
        ]
      }
    ]
  } satisfies ExportTraceServiceRequest);
}
