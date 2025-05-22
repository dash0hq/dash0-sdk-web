import { ExportLogsServiceRequest, ExportTraceServiceRequest } from "../../../types/otlp";
import { browser } from "@wdio/globals";
import { INIT_MESSAGE } from "../../../src/utils";

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
  // We ignore all logs that happen before the dash0 sdk is starting initialization.
  // This is because the e2e tooling can in some rare conditions cause errors on browser init.
  let initTs: number | undefined = undefined;
  return browserLogs.filter(({ timestamp, text }) => {
    if (initTs != undefined) return true;

    if (text?.includes(INIT_MESSAGE)) {
      initTs = timestamp;
      return true;
    }

    return false;
  });
}

function handleLogEvent(event: BrowserLog) {
  browserLogs.push(event);
}

async function subscribeToBrowserLogs() {
  browserLogs = [];
  if (!browser.isBidi) {
    console.log(
      "Browser connection does not have a bidi session, browser logs are unavailable and expectations on them will implicitly pass"
    );
    return;
  }

  await browser.sessionSubscribe({ events: ["log.entryAdded"] });
  browser.on("log.entryAdded", handleLogEvent);
}

function unsubscribeFromBrowserLogs() {
  browser.off("log.entryAdded", handleLogEvent);
}
