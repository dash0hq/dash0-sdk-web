import { ExportLogsServiceRequest, ExportTraceServiceRequest } from "../../../types/otlp";

export async function sharedBeforeEach() {
  await clearOTLPRequests();
  await clearAjaxRequests();
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

export function retry<T>(fn: () => Promise<T>, maxMillis: number = 10000, until?: number): Promise<T> {
  until = until || Date.now() + maxMillis;

  if (Date.now() > until) {
    return fn();
  }

  return delay(maxMillis / 20)
    .then(fn)
    .catch(() => retry(fn, maxMillis, until));
}

function delay(millis): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export function expectOneMatching<T>(arr: T[], fn: (item: T) => void): T {
  if (!arr || arr.length === 0) {
    throw new Error("Could not find an item which matches all the criteria. Got 0 items.");
  }

  let error: Error;

  for (const item of arr) {
    try {
      fn(item);
      return item;
    } catch (e) {
      error = e;
    }
  }

  if (error) {
    throw new Error(
      "Could not find an item which matches all the criteria. Got " +
        arr.length +
        " items. Last error: " +
        error.message +
        ". All Items:\n" +
        JSON.stringify(arr, undefined, 2) +
        ". Error stack trace: " +
        error.stack
    );
  }
}
