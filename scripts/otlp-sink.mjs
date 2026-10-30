/* eslint-env node */
// A local OTLP/HTTP sink for manual testing. Point the SDK's `endpoint.url` at it instead of Dash0.
//
//   node scripts/otlp-sink.mjs            # listens on http://localhost:4318
//   PORT=5000 node scripts/otlp-sink.mjs
//
// What it does with every POST /v1/logs and /v1/traces:
//   - appends the raw request (headers + decoded body) to otlp-sink/requests.ndjson
//   - prints one summary line per log record / span to the terminal
//   - stores session recording chunks under otlp-sink/recordings/<recordingId>/<seq>.json
//   - serves http://localhost:4318/ with a replay page per recording (rrweb-player from a CDN)
//
// Gzip request bodies (which the SDK uses for recording chunks) are inflated by body-parser.
//
// Profiles (POST /v1development/profiles) are protobuf. Each one is decoded with the generated code and summarized,
// and http://localhost:4318/examples/profiling/ serves the profiling example page with `Document-Policy: js-profiling`.
import express from "express";
import bodyParser from "body-parser";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

const { ExportProfilesServiceRequest } = await tsImport(
  "../src/profiling/otlp-test/opentelemetry/proto/collector/profiles/v1development/profiles_service.ts",
  import.meta.url
);
const ROOT = path.resolve(import.meta.dirname, "..");

const PORT = parseInt(process.env.PORT ?? "4318", 10);
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "otlp-sink");
const RECORDINGS_DIR = path.join(OUT_DIR, "recordings");
const REQUESTS_FILE = path.join(OUT_DIR, "requests.ndjson");

mkdirSync(RECORDINGS_DIR, { recursive: true });

const app = express();

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Encoding, Dash0-Dataset, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Registered before the JSON parser, which would otherwise try to parse the protobuf body.
app.post("/v1development/profiles", bodyParser.raw({ limit: "50mb", type: () => true }), (req, res) => {
  const isGzip = req.headers["content-encoding"] === "gzip";
  const decoded = ExportProfilesServiceRequest.decode(req.body);
  const summary = summarizeProfiles(decoded, Number(req.headers["content-length"]), req.body.length);
  counters.profiles++;
  appendFileSync(
    REQUESTS_FILE,
    JSON.stringify({ ts: new Date().toISOString(), path: req.path, headers: req.headers, summary }) + "\n"
  );
  console.log(
    `PROF  samples=${summary.samples}  idle=${summary.idle}  stacks=${summary.stacks}  bytes=${summary.protobufBytes}  json~${summary.jsonBytes}${isGzip ? ` (gzip ${summary.wireBytes})` : ""}  session=${summary.attributes["session.id"]}  top=${summary.topLeaves.join(", ")}`
  );
  res.status(200).type("application/x-protobuf").send(Buffer.alloc(0));
});

function summarizeProfiles(request, wireBytes, protobufBytes) {
  const dict = request.dictionary;
  const str = (i) => dict.stringTable[i];
  const profile = request.resourceProfiles[0].scopeProfiles[0].profiles[0];
  const attributes = Object.fromEntries(
    profile.attributeIndices.map((i) => {
      const a = dict.attributeTable[i];
      const v = a.value ?? {};
      return [str(a.keyStrindex), String(v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue)];
    })
  );
  const leafCounts = new Map();
  let samples = 0;
  for (const sample of profile.samples) {
    const leaf = dict.stackTable[sample.stackIndex].locationIndices[0];
    const fn = dict.functionTable[dict.locationTable[leaf].lines[0].functionIndex];
    leafCounts.set(
      str(fn.nameStrindex),
      (leafCounts.get(str(fn.nameStrindex)) ?? 0) + sample.timestampsUnixNano.length
    );
    samples += sample.timestampsUnixNano.length;
  }
  const topLeaves = [...leafCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => `${name}=${n}`);
  return {
    wireBytes,
    protobufBytes,
    // Approximates the OTLP/JSON encoding of the same request: int64 as strings, bytes as base64.
    jsonBytes: JSON.stringify(request, (_, v) =>
      typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v
    ).length,
    samples,
    idle: Number(attributes["dash0.profiling.idle_sample_count"] ?? 0),
    stacks: dict.stackTable.length - 1,
    functions: dict.functionTable.length - 1,
    durationMs: Number(profile.durationNano) / 1e6,
    periodNs: Number(profile.period),
    attributes,
    topLeaves,
  };
}

// The example page sends its benchmark results here; see examples/profiling/index.html.
app.post("/bench", bodyParser.json(), (req, res) => {
  appendFileSync(path.join(OUT_DIR, "bench.ndjson"), JSON.stringify(req.body) + "\n");
  console.log(`BENCH ${JSON.stringify(req.body)}`);
  res.status(204).end();
});

// Without `?policy=off` the page gets the header JS Self-Profiling needs; with it, the SDK reports the header missing.
app.use("/examples", (req, res, next) => {
  if (req.query.policy !== "off") res.set("Document-Policy", "js-profiling");
  next();
});
app.use("/examples", express.static(path.join(ROOT, "examples")));
app.use("/dist", express.static(path.join(ROOT, "dist")));

app.use(bodyParser.json({ limit: "50mb", type: () => true }));

function attr(record, key) {
  const kv = (record.attributes ?? []).find((a) => a.key === key);
  if (!kv) return undefined;
  const v = kv.value ?? {};
  return v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
}

const counters = { logs: 0, spans: 0, chunks: 0, chunkBytes: 0, profiles: 0 };

// The ids come from the request body and end up in file paths and HTML. Accept only what the SDK emits.
const RECORDING_ID_PATTERN = /^[0-9a-f]{32}$/;
const SEQ_PATTERN = /^\d{1,10}$/;

function handleLog(record) {
  const eventName = attr(record, "event.name");
  const sessionId = attr(record, "session.id");
  if (eventName === "browser.session_recording") {
    const recordingId = String(attr(record, "dash0.session_recording.id"));
    const seq = String(attr(record, "dash0.session_recording.seq"));
    if (!RECORDING_ID_PATTERN.test(recordingId) || !SEQ_PATTERN.test(seq)) {
      console.warn(`LOG   ${eventName}  skipped chunk with invalid id/seq: ${recordingId} / ${seq}`);
      return;
    }
    const body = record.body?.stringValue ?? "[]";
    const dir = path.join(RECORDINGS_DIR, recordingId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${seq.padStart(5, "0")}.json`), body);
    counters.chunks++;
    counters.chunkBytes += body.length;
    console.log(
      `LOG   ${eventName}  session=${sessionId}  recording=${recordingId}  seq=${seq}  events=${attr(record, "dash0.session_recording.event_count")}  snapshot=${attr(record, "dash0.session_recording.has_snapshot")}  bytes=${body.length}  trace=${record.traceId}`
    );
    return;
  }
  counters.logs++;
  const bodyPreview = record.body?.stringValue ? ` "${record.body.stringValue.slice(0, 60)}"` : "";
  console.log(
    `LOG   ${eventName ?? "(no event.name)"}  session=${sessionId}  sev=${record.severityText ?? ""}${bodyPreview}${record.traceId ? `  trace=${record.traceId}` : ""}`
  );
}

function handleSpan(span) {
  counters.spans++;
  const url = attr(span, "url.full") ?? "";
  console.log(`SPAN  ${span.name}  ${url}  status=${span.status?.code ?? 0}  trace=${span.traceId}`);
}

app.post("/v1/:signal", (req, res) => {
  const body = req.body ?? {};
  appendFileSync(
    REQUESTS_FILE,
    JSON.stringify({ ts: new Date().toISOString(), path: req.path, headers: req.headers, body }) + "\n"
  );

  for (const rl of body.resourceLogs ?? []) {
    for (const sl of rl.scopeLogs ?? []) {
      for (const record of sl.logRecords ?? []) handleLog(record);
    }
  }
  for (const rs of body.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) handleSpan(span);
    }
  }
  res.status(200).json({});
});

function listRecordings() {
  if (!existsSync(RECORDINGS_DIR)) return [];
  return readdirSync(RECORDINGS_DIR)
    .filter((id) => RECORDING_ID_PATTERN.test(id))
    .map((id) => {
      const chunks = readdirSync(path.join(RECORDINGS_DIR, id))
        .filter((f) => f.endsWith(".json"))
        .sort();
      return { id, chunks: chunks.length };
    });
}

app.get("/", (_req, res) => {
  const items = listRecordings()
    .map((r) => `<li><a href="/replay/${r.id}">${r.id}</a> (${r.chunks} chunks)</li>`)
    .join("");
  res.type("html").send(`<!doctype html><meta charset="utf-8"><title>OTLP sink</title>
<h1>OTLP sink</h1>
<p>logs=${counters.logs} spans=${counters.spans} profiles=${counters.profiles} recording chunks=${counters.chunks} (${(counters.chunkBytes / 1024).toFixed(1)} KB raw JSON)</p>
<p>Raw requests: <code>${REQUESTS_FILE}</code></p>
<h2>Recordings</h2><ul>${items || "<li>none yet</li>"}</ul>`);
});

app.get("/recordings/:id/events.json", (req, res) => {
  const dir = path.join(RECORDINGS_DIR, path.basename(req.params.id));
  if (!existsSync(dir)) return res.status(404).end();
  const events = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));
  res.json(events);
});

app.get("/replay/:id", (req, res) => {
  const id = path.basename(req.params.id);
  res.type("html").send(`<!doctype html><meta charset="utf-8"><title>replay ${id}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.1.1/dist/style.css" />
<p><a href="/">back</a> &middot; recording <code>${id}</code></p>
<div id="player"></div>
<script type="module">
// jsdelivr's "+esm" endpoint bundles the player with its dependencies and serves it as JavaScript.
// (The UMD file is a .cjs, which jsdelivr serves as application/node and browsers refuse to execute.)
import Player from "https://cdn.jsdelivr.net/npm/rrweb-player@2.1.1/+esm";
const target = document.getElementById("player");
fetch("/recordings/${id}/events.json").then(r => r.json()).then(events => {
  if (events.length < 2) { target.textContent = "Need at least 2 events to replay."; return; }
  new Player({ target, props: { events, autoPlay: true, width: 1024, height: 640 } });
}).catch(err => { target.textContent = "Replay failed: " + err; });
</script>`);
});

// Loopback only: the sink accepts unauthenticated writes and reflects any Origin, so it must not be reachable
// from the network.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`OTLP sink listening on http://localhost:${PORT}`);
  console.log(`  endpoint.url for the SDK : http://localhost:${PORT}`);
  console.log(`  raw requests             : ${REQUESTS_FILE}`);
  console.log(`  recordings + replay      : http://localhost:${PORT}/`);
  console.log(`  profiling example        : http://localhost:${PORT}/examples/profiling/`);
});
