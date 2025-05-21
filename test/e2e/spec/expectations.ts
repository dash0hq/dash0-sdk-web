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

export async function expectSpanMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();

  expect(requests.filter((r) => r.path === "/v1/traces")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          resourceSpans: expect.arrayContaining([
            expect.objectContaining({
              scopeSpans: expect.arrayContaining([
                expect.objectContaining({ spans: expect.arrayContaining([matcher]) }),
              ]),
            }),
          ]),
        }),
      }),
    ])
  );
}

export async function expectSpanCount(n: number) {
  const requests = await getOTLPRequests();

  expect(requests.filter((r) => r.path === "/v1/traces")).toHaveLength(n);
}

export async function expectLogMatching(matcher: ExpectWebdriverIO.PartialMatcher) {
  const requests = await getOTLPRequests();

  expect(requests.filter((r) => r.path === "/v1/logs")).toEqual(
    expect.arrayContaining([
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
    ])
  );
}

export function expectNoBrowserErrors() {
  // bidi is required to subscribe to browser logs
  if (!browser.isBidi) {
    return;
  }

  const errors = getBrowserLogs().filter(({ level }) => level === "error");
  expect(errors).toHaveLength(0);
}
