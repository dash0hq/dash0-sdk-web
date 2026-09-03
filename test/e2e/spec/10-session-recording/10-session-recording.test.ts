import { sharedAfterEach, sharedBeforeEach, getOTLPRequests } from "../shared";
import { generateUniqueId } from "../../../../src/utils";
import { browser } from "@wdio/globals";
import { loadPage, retry } from "../utils";
import { expectLogMatching, expectNoBrowserErrors } from "../expectations";

const EVENT_NAME = "browser.session_recording";

type ReceivedLog = {
  attributes: Array<{ key: string; value: any }>;
  body?: { stringValue?: string };
  traceId?: string;
  spanId?: string;
};

function attr(log: ReceivedLog, key: string): any {
  return log.attributes.find((a) => a.key === key)?.value;
}

async function getRecordingLogs(): Promise<ReceivedLog[]> {
  const requests = await getOTLPRequests();
  const logs: ReceivedLog[] = [];
  for (const request of requests) {
    if (request.path !== "/v1/logs") continue;
    for (const resourceLog of (request.body as any).resourceLogs ?? []) {
      for (const scopeLog of resourceLog.scopeLogs ?? []) {
        for (const log of scopeLog.logRecords ?? []) {
          if (attr(log, "event.name")?.stringValue === EVENT_NAME) {
            logs.push(log);
          }
        }
      }
    }
  }
  return logs;
}

describe("Session Recording", () => {
  beforeEach(sharedBeforeEach);
  afterEach(sharedAfterEach);

  it("transmits a first chunk with a full snapshot whose trace id embeds the session id", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`/e2e/spec/10-session-recording/page.html?testId=${testId}`);
    await expect(await browser.getTitle()).toMatch(/session recording test/);

    await retry(async () => {
      await expectLogMatching(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            { key: "event.name", value: { stringValue: EVENT_NAME } },
            { key: "dash0.session_recording.seq", value: { intValue: "0" } },
            { key: "dash0.session_recording.has_snapshot", value: { boolValue: true } },
            { key: "dash0.session_recording.id", value: { stringValue: expect.stringMatching(/^[0-9a-f]{32}$/) } },
            { key: "session.id", value: { stringValue: expect.any(String) } },
            { key: "page.load.id", value: { stringValue: expect.any(String) } },
          ]),
          body: { stringValue: expect.any(String) },
          severityNumber: 9,
          severityText: "INFO",
          traceId: expect.stringMatching(/^d042[0-9a-f]{28}$/),
          spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        })
      );
    });

    const [first] = await getRecordingLogs();
    const sessionId: string = attr(first!, "session.id").stringValue;
    // Trace id layout: "d042" + 1 flags byte + 8 session id bytes + random. See src/utils/trace-id.ts.
    expect(first!.traceId!.substring(6, 22)).toBe(sessionId);

    const events = JSON.parse(first!.body!.stringValue!);
    expect(Array.isArray(events)).toBe(true);
    // rrweb starts every recording with Meta (4) followed by FullSnapshot (2).
    expect(events.map((e: any) => e.type).slice(0, 2)).toEqual([4, 2]);

    expectNoBrowserErrors();
  });

  it("masks inputs and marked text, blocks marked elements, and keeps other text", async () => {
    const testId = generateUniqueId(16);
    const secret = `secret-${generateUniqueId(8)}`;
    await loadPage(`/e2e/spec/10-session-recording/page.html?testId=${testId}`);

    const input = await $("#secret-input");
    await input.setValue(secret);

    // Wait for at least one chunk after the snapshot so the typed input has been captured as incremental events.
    await retry(async () => {
      const logs = await getRecordingLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    const bodies = (await getRecordingLogs()).map((l) => l.body?.stringValue ?? "").join("\n");
    expect(bodies).toContain("Visible heading text");
    expect(bodies).not.toContain(secret);
    expect(bodies).not.toContain("Masked paragraph text");
    expect(bodies).not.toContain("Blocked element text");

    expectNoBrowserErrors();
  });

  it("increments seq across chunks and shares one trace id and recording id", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`/e2e/spec/10-session-recording/page.html?testId=${testId}`);

    const toggle = await $("#toggle");
    await toggle.click();

    await retry(async () => {
      const logs = await getRecordingLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    const logs = await getRecordingLogs();
    const seqs = logs.map((l) => parseInt(attr(l, "dash0.session_recording.seq").intValue, 10)).sort((a, b) => a - b);
    expect(seqs).toEqual(seqs.map((_, i) => i));

    const traceIds = new Set(logs.map((l) => l.traceId));
    const spanIds = new Set(logs.map((l) => l.spanId));
    const recordingIds = new Set(logs.map((l) => attr(l, "dash0.session_recording.id").stringValue));
    expect(traceIds.size).toBe(1);
    expect(spanIds.size).toBe(1);
    expect(recordingIds.size).toBe(1);

    const bodies = logs.map((l) => l.body?.stringValue ?? "").join("\n");
    expect(bodies).toContain("Heading after click");

    expectNoBrowserErrors();
  });

  it("flushes buffered events and stops on stopSessionRecording", async () => {
    const testId = generateUniqueId(16);
    await loadPage(`/e2e/spec/10-session-recording/page.html?testId=${testId}`);

    await retry(async () => {
      const logs = await getRecordingLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    const toggle = await $("#toggle");
    await toggle.click();
    const stop = await $("button=Stop Recording");
    await stop.click();

    await retry(async () => {
      const bodies = (await getRecordingLogs()).map((l) => l.body?.stringValue ?? "").join("\n");
      expect(bodies).toContain("Heading after click");
    });

    // No further chunks after stop, even when the DOM keeps changing.
    const countAfterStop = (await getRecordingLogs()).length;
    await browser.execute(() => {
      document.getElementById("visible-heading")!.textContent = "Changed after stop";
    });
    await browser.pause(1500);
    const logs = await getRecordingLogs();
    expect(logs.length).toBe(countAfterStop);
    expect(logs.map((l) => l.body?.stringValue ?? "").join("\n")).not.toContain("Changed after stop");

    expectNoBrowserErrors();
  });
});
