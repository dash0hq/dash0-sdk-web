import { ExportLogsServiceRequest, ExportTraceServiceRequest } from "../../../types/otlp";
import { browser } from "@wdio/globals";

type BrowserLog = {
  level: string;
  text: string | null;
  timestamp: number;
};

let browserLogs: BrowserLog[] = [];

export async function sharedBeforeEach() {
  await clearOTLPRequests();
  await clearAjaxRequests();
  await subscribeToBrowserLogs();
}

export async function sharedAfterEach() {
  unsubscribeFromBrowserLogs();
}

type OTLPRequest = {
  path: string;
  headers: Record<string, string>;
  body: ExportLogsServiceRequest | ExportTraceServiceRequest;
};

export async function getOTLPRequests(): Promise<OTLPRequest[]> {
  const resp = await fetch("http://127.0.0.1:5001/otlp-requests");
  if (!resp.ok) {
    throw new Error("Failed to retrieve OTLP requests");
  }

  return resp.json();
}

export async function clearOTLPRequests() {
  const resp = await fetch("http://127.0.0.1:5001/otlp-requests", {
    method: "DELETE",
  });
  if (!resp.ok) {
    throw new Error("Failed to clear OTLP requests");
  }
}

export async function clearAjaxRequests() {
  const resp = await fetch("http://127.0.0.1:5001/ajax-requests", {
    method: "DELETE",
  });
  if (!resp.ok) {
    throw new Error("Failed to clear AJAX requests");
  }
}

export function getBrowserLogs() {
  return browserLogs;
}

function handleLogEvent(event: BrowserLog) {
  browserLogs.push(event);
}

async function subscribeToBrowserLogs() {
  browserLogs = [];
  await browser.sessionSubscribe({ events: ["log.entryAdded"] });
  browser.on("log.entryAdded", handleLogEvent);
}

function unsubscribeFromBrowserLogs() {
  browser.off("log.entryAdded", handleLogEvent);
}
