import { getBrowserLogs, getOTLPRequests } from "./shared";
import { browser } from "@wdio/globals";

export function expectOneMatching<T>(arr: T[], fn: (item: T) => void): T {
  if (!arr || arr.length === 0) {
    throw new Error("Could not find an item which matches all the criteria. Got 0 items.");
  }

  let error: Error | undefined = undefined;

  for (const item of arr) {
    try {
      fn(item);
      return item;
    } catch (e) {
      error = e as Error;
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

  throw new Error("this should be unreachable");
}

/**
 * Runs an assertion and, if it fails, rethrows the error with the full-depth
 * JSON serialization of the received payload appended.
 *
 * jest's matcher diffs (used by expect-webdriverio) are serialized through
 * `jest-matcher-utils`' `stringify`, which truncates objects to `[Object]` and
 * arrays to `…` once the output exceeds ~10k characters. For the deeply nested
 * OTLP payloads we assert against this hides exactly the data needed to debug a
 * failure (e.g. browser-specific differences only reproducible in CI). Dumping
 * the received payload at full depth gives us something actionable.
 */
function withFullDepthDiff(received: unknown, assert: () => void) {
  try {
    assert();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    err.message += "\n\nFull received payload (full depth):\n" + JSON.stringify(received, undefined, 2);
    throw err;
  }
}

function getSpanMatcher(matcher: ExpectWebdriverIO.PartialMatcher) {
  return expect.arrayContaining([
    expect.objectContaining({
      body: expect.objectContaining({
        resourceSpans: expect.arrayContaining([
          expect.objectContaining({
            scopeSpans: expect.arrayContaining([expect.objectContaining({ spans: expect.arrayContaining([matcher]) })]),
          }),
        ]),
      }),
    }),
  ]);
}

export async function expectSpanMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();
  const traceRequests = requests.filter((r) => r.path === "/v1/traces");

  withFullDepthDiff(traceRequests, () => expect(traceRequests).toEqual(getSpanMatcher(matcher)));
}

export async function expectNoSpanMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();
  const traceRequests = requests.filter((r) => r.path === "/v1/traces");

  withFullDepthDiff(traceRequests, () => expect(traceRequests).not.toEqual(getSpanMatcher(matcher)));
}

export async function expectSpanCount(n: number) {
  const requests = await getOTLPRequests();

  expect(requests.filter((r) => r.path === "/v1/traces")).toHaveLength(n);
}

function getLogMatcher(matcher: ExpectWebdriverIO.PartialMatcher) {
  return expect.arrayContaining([
    expect.objectContaining({
      body: expect.objectContaining({
        resourceLogs: expect.arrayContaining([
          expect.objectContaining({
            scopeLogs: expect.arrayContaining([
              expect.objectContaining({ logRecords: expect.arrayContaining([matcher]) }),
            ]),
          }),
        ]),
      }),
    }),
  ]);
}

export async function expectLogMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();
  const logRequests = requests.filter((r) => r.path === "/v1/logs");

  withFullDepthDiff(logRequests, () => expect(logRequests).toEqual(getLogMatcher(matcher)));
}

export async function expectNoLogMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();
  const logRequests = requests.filter((r) => r.path === "/v1/logs");

  withFullDepthDiff(logRequests, () => expect(logRequests).not.toEqual(getLogMatcher(matcher)));
}

/**
 * Flattens the recorded OTLP payloads down to the individual records.
 *
 * The expect*Matching helpers above cover everything that can be expressed as a
 * matcher. These exist for assertions that need a transmitted *value* rather
 * than a shape -- e.g. correlating a span's `user_interaction.id` with the id
 * the `browser.interaction` event carried, where the id is only known at
 * assertion time.
 */
export async function getLogRecords() {
  const requests = await getOTLPRequests();
  return requests
    .filter((r) => r.path === "/v1/logs")
    .flatMap((r) =>
      "resourceLogs" in r.body ? r.body.resourceLogs.flatMap((rl) => rl.scopeLogs.flatMap((sl) => sl.logRecords)) : []
    );
}

export async function getSpans() {
  const requests = await getOTLPRequests();
  return requests
    .filter((r) => r.path === "/v1/traces")
    .flatMap((r) =>
      "resourceSpans" in r.body ? r.body.resourceSpans.flatMap((rs) => rs.scopeSpans.flatMap((ss) => ss.spans)) : []
    );
}

export function getStringAttribute(record: { attributes?: any[] }, key: string): string | undefined {
  return record.attributes?.find((kv) => kv.key === key)?.value?.stringValue;
}

export function expectNoBrowserErrors() {
  // bidi is required to subscribe to browser logs
  if (!browser.isBidi) {
    return;
  }

  const errors = getBrowserLogs().filter(({ level }) => level === "error");
  expect(errors).toHaveLength(0);
}
