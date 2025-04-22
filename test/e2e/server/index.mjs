import bodyParser from "body-parser";
import multiparty from "multiparty";
import serveIndex from "serve-index";
import express from "express";
import { v4 as uuidV4 } from "uuid";
import path from "node:path";

const app = express();
const servers = [];

app.use((_, res, next) => {
  res.set("Timing-Allow-Origin", "*");
  next();
});

app.use((req, res, next) => {
  if (req.query["cors"]) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Encoding, Dash0-Dataset, Content-Type");
  }
  next();
});

app.use((req, res, next) => {
  if (req.query["with-server-timing"]) {
    res.set("Server-Timing", "traceparent;desc=00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
  }
  next();
});

app.use((req, res, next) => {
  if (req.query["csp"]) {
    const hosts = getServerPorts()
      .map((p) => `http://127.0.0.1:${p}`)
      .join(" ");
    res.set("Content-Security-Policy", `default-src ${hosts}; script-src 'unsafe-inline' ${hosts};`);
  }
  next();
});

[
  path.join(import.meta.dirname, "..", "..", "..", "dist"),
  path.join(import.meta.dirname, "..", "..", "e2e"),
  path.join(import.meta.dirname, "..", "..", "experiments"),
].forEach((p) =>
  app.use(
    `/${path.basename(p)}`,
    express.static(p),
    serveIndex(p, {
      icons: true,
    })
  )
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw({ type: "text/plain" }));

app.get("/", (_, res) => {
  res.send("OK");
});

const otlpRequests = [];
app.post("/v1/:signal", (req, res) => {
  otlpRequests.push({
    path: req.path,
    headers: req.headers,
    body: req.body,
  });
  res.send("OK");
});

app.get("/otlp-requests", (_, res) => {
  res.json(otlpRequests);
});

app.get("/otlp-requests-and-clear", (_, res) => {
  res.json(otlpRequests.slice());
  otlpRequests.length = 0;
});

app.delete("/otlp-requests", (_, res) => {
  otlpRequests.length = 0;
  res.send("OK");
});

const ajaxRequests = [];
app.all("/ajax", (req, res) => {
  const response = uuidV4();
  ajaxRequests.push({
    method: req.method,
    url: req.url,
    params: req.params,
    headers: req.headers,
    response,
  });

  // Delay responses to allow timeout tests.
  setTimeout(() => {
    res.send(response);
  }, 100);
});

app.post("/form", (req, res) => {
  const form = new multiparty.Form();
  let response = uuidV4();
  form.parse(req, function (err, fields) {
    if (err) {
      response = "ERROR";
    }

    if (!fields) {
      response = "ERROR";
    } else {
      ajaxRequests.push({
        method: req.method,
        url: req.url,
        params: req.params,
        headers: req.headers,
        response,
        fields,
      });
    }
  });

  // Delay responses to allow timeout tests.
  setTimeout(() => {
    res.send(response);
  }, 100);
});

app.get("/ajax-requests", (_, res) => {
  res.json(ajaxRequests);
});

app.delete("/ajax-requests", (_, res) => {
  ajaxRequests.length = 0;
  res.send("OK");
});

getServerPorts().forEach((port) =>
  servers.push(
    app.listen(port, (error) => {
      if (error != null) {
        throw error;
      }
      if (process.env["IS_TEST"] !== "true") {
        log("Test server available via http://127.0.0.1:%s (check /e2e, /experiments or /dist)", port);
      }
    })
  )
);

if (process.env["IS_TEST"] !== "true") {
  log(
    "\nOpen http://127.0.0.1:%s/e2e?ports=%s to check cross-origin cases",
    getServerPorts()[0],
    getServerPorts().join(",")
  );

  log(
    "Please ensure that you retain the ?ports query parameters when opening\n" +
      "cross-origin test cases manually. As this is a required parameter for them.\n\n"
  );
}

function log(...args) {
  if (process.env["npm_lifecycle_script"] == null || !process.env["npm_lifecycle_script"].startsWith("vitest")) {
    console.log.apply(console, args);
  }
}

function getServerPorts() {
  const ports = process.env["SERVER_PORTS"];
  if (!ports) {
    throw new Error("Required env var SERVER_PORTS is not defined");
  }
  return ports.split(",").map((v) => parseInt(v, 10));
}

const shutdown = () => {
  console.log("Shutting down servers");
  servers.forEach((s) => s.close());
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
