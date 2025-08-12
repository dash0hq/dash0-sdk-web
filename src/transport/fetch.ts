import { vars } from "../vars";
import { noop, warn, fetch, debug } from "../utils";

const BEACON_BODY_SIZE_LIMIT = 60000;

export async function send(path: string, body: unknown): Promise<void> {
  debug("Transmitting telemetry to endpoints", body);

  const jsonString = JSON.stringify(body);
  let requestBody: ArrayBuffer | string = jsonString;
  let byteLength = jsonString.length;
  let isCompressed = false;

  // Try to compress if supported
  if (typeof CompressionStream !== "undefined") {
    requestBody = await compressWithGzip(jsonString);
    byteLength = requestBody.byteLength;
    isCompressed = true;
  }

  // Send to all endpoints in parallel
  await Promise.all(
    vars.endpoints.map(async (endpoint) => {
      try {
        const url = new URL(endpoint["url"]);
        url.pathname = url.pathname + (url.pathname.endsWith("/") ? path.substring(1) : path);

        const headers: HeadersInit = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${endpoint["authToken"]}`,
        };

        if (endpoint.dataset) {
          headers["Dash0-Dataset"] = endpoint["dataset"];
        }

        // Try to compress if supported
        if (isCompressed) {
          headers["Content-Encoding"] = "gzip";
        }

        if (!fetch) {
          warn("Unable to send telemetry, fetch is not defined");
          return;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: requestBody,

          // The keepalive flag is related to the window.sendBeacon API. This in turn has size limitations.
          keepalive: byteLength <= BEACON_BODY_SIZE_LIMIT,
        });

        // read the body so the connection can be closed
        response.text().catch(noop);

        if (!response.ok) {
          warn(`Failed to send telemetry to ${url}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        warn(`Error sending telemetry to ${endpoint.url}${path}:`, error);
      }
    })
  );
}

async function compressWithGzip(data: string): Promise<ArrayBuffer> {
  const blob = new Blob([data]);
  const stream = blob.stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  return new Response(compressedStream).arrayBuffer();
}
