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
import express from "express";
import bodyParser from "body-parser";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

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

app.use(bodyParser.json({ limit: "50mb", type: () => true }));

function attr(record, key) {
  const kv = (record.attributes ?? []).find((a) => a.key === key);
  if (!kv) return undefined;
  const v = kv.value ?? {};
  return v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue;
}

const counters = { logs: 0, spans: 0, chunks: 0, chunkBytes: 0 };

function handleLog(record) {
  const eventName = attr(record, "event.name");
  const sessionId = attr(record, "session.id");
  if (eventName === "browser.session_recording") {
    const recordingId = attr(record, "dash0.session_recording.id");
    const seq = attr(record, "dash0.session_recording.seq");
    const body = record.body?.stringValue ?? "[]";
    const dir = path.join(RECORDINGS_DIR, recordingId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${String(seq).padStart(5, "0")}.json`), body);
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
  return readdirSync(RECORDINGS_DIR).map((id) => {
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
<p>logs=${counters.logs} spans=${counters.spans} recording chunks=${counters.chunks} (${(counters.chunkBytes / 1024).toFixed(1)} KB raw JSON)</p>
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

app.listen(PORT, () => {
  console.log(`OTLP sink listening on http://localhost:${PORT}`);
  console.log(`  endpoint.url for the SDK : http://localhost:${PORT}`);
  console.log(`  raw requests             : ${REQUESTS_FILE}`);
  console.log(`  recordings + replay      : http://localhost:${PORT}/`);
});
