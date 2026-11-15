// OMR service: PDF in, MusicXML out. A thin HTTP wrapper around the Audiveris command line (AGPL-3.0).
// Jobs: POST /jobs (PDF) -> 202 {id}; GET /jobs/:id -> {status, position, xml?, error?}.
// One recognition at a time (the JVM is heavy); a short queue; every job in its own temporary directory.
// The result is polled so that no HTTP request outlives a reverse proxy's timeout (a recognition takes about a minute).
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 8080);
const AUDIVERIS = process.env.AUDIVERIS_BIN ?? "/opt/audiveris/bin/Audiveris";
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 280_000);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_QUEUE = 4;
const JOB_TTL_MS = 15 * 60_000;
const UUID = /^[0-9a-f-]{36}$/;

let running = false;
const queue = []; // { pdf, id }
const jobs = new Map(); // id -> { status: "queued" | "running" | "done" | "error", xml?, error?, at }

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const unzipFirstXml = (mxl) =>
  new Promise((resolve, reject) => {
    // container.xml names the score; fall back to the first non-META-INF xml
    execFile("unzip", ["-p", mxl, "META-INF/container.xml"], { maxBuffer: 1 << 20 }, (err, container) => {
      const root = !err && /full-path="([^"]+)"/.exec(container)?.[1];
      const args = root ? ["-p", mxl, root] : ["-p", mxl, "*.xml", "-x", "META-INF/*"];
      execFile("unzip", args, { maxBuffer: 256 << 20 }, (e2, xml) => (e2 ? reject(e2) : resolve(xml)));
    });
  });

async function recognise(pdf) {
  const dir = await mkdtemp(join(tmpdir(), "omr-"));
  try {
    const input = join(dir, "score.pdf");
    const out = join(dir, "out");
    await writeFile(input, pdf);
    const log = [];
    await new Promise((resolve, reject) => {
      const p = spawn(AUDIVERIS, ["-batch", "-transcribe", "-export", "-output", out, input], { stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => {
        p.kill("SIGKILL");
        reject(Object.assign(new Error("El reconocimiento superó el tiempo máximo."), { status: 504 }));
      }, JOB_TIMEOUT_MS);
      for (const s of [p.stdout, p.stderr]) s.on("data", (d) => log.push(String(d)));
      p.on("error", (e) => (clearTimeout(timer), reject(e)));
      p.on("close", (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(new Error(`Audiveris terminó con código ${code}.`))));
    }).catch((e) => {
      e.log = log.join("").slice(-1200);
      throw e;
    });
    const files = await readdir(out, { recursive: true }).catch(() => []);
    const mxl = files.find((f) => /\.mxl$/i.test(f));
    const xml = files.find((f) => /\.(xml|musicxml)$/i.test(f));
    if (mxl) return await unzipFirstXml(join(out, mxl));
    if (xml) return await readFile(join(out, xml), "utf8");
    throw Object.assign(new Error("No se reconoció ninguna música en el PDF (¿es una partitura legible?)."), { status: 422, log: log.join("").slice(-1200) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function next() {
  if (running || !queue.length) return;
  const { pdf, id } = queue.shift();
  const job = jobs.get(id);
  if (!job) return next();
  running = true;
  job.status = "running";
  recognise(pdf)
    .then((xml) => Object.assign(job, { status: "done", xml: String(xml), at: Date.now() }))
    .catch((e) => {
      console.error("[omr] failed:", e.message, e.log ?? "");
      Object.assign(job, { status: "error", error: e.message, at: Date.now() });
    })
    .finally(() => {
      running = false;
      next();
    });
}

setInterval(() => {
  for (const [id, j] of jobs) if (Date.now() - j.at > JOB_TTL_MS && j.status !== "running") jobs.delete(id);
}, 60_000).unref();

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, queued: queue.length, running });

  const m = req.method === "GET" ? /^\/jobs\/([^/?]+)$/.exec(req.url ?? "") : null;
  if (m) {
    const job = UUID.test(m[1]) ? jobs.get(m[1]) : undefined;
    if (!job) return json(res, 404, { error: "Trabajo desconocido o caducado." });
    const position = job.status === "queued" ? queue.findIndex((q) => q.id === m[1]) + 1 : 0;
    return json(res, 200, {
      status: job.status,
      position,
      ...(job.status === "done" ? { xml: job.xml } : {}),
      ...(job.status === "error" ? { error: job.error } : {}),
    });
  }

  if (req.method !== "POST" || req.url !== "/jobs") return json(res, 404, { error: "not found" });
  if (queue.length >= MAX_QUEUE) return json(res, 429, { error: "Cola de reconocimiento llena." });
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BYTES) {
      json(res, 413, { error: "PDF demasiado grande." });
      req.destroy();
    } else chunks.push(c);
  });
  req.on("end", () => {
    const pdf = Buffer.concat(chunks);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return json(res, 415, { error: "No es un PDF." });
    const id = randomUUID();
    jobs.set(id, { status: "queued", at: Date.now() });
    queue.push({ pdf, id });
    json(res, 202, { id });
    next();
  });
}).listen(PORT, () => console.log(`[omr] listening on ${PORT}`));
