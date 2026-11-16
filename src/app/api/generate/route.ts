/**
 * Generate a classical piece as Over Strudel code with Gemini.
 *
 *   POST /api/generate  { title, password, measures? }  ->  202 { id }
 *   GET  /api/generate?id=...                            ->  { status: "running"|"done"|"error", stage?, result?, error? }
 *
 * The Gemini API key and the access password live ONLY in the server's environment (GEMINI_API_KEY, GENERATE_PASSWORD;
 * optionally GEMINI_MODEL). The browser never sees the key. A generation takes up to a couple of minutes, longer than a
 * reverse proxy waits, so it runs as a job that the browser polls. Everything the model writes is machine-checked
 * (src/lib/ai/validate.ts) and its mistakes are sent back to it before anything is delivered.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { GeminiError, generatePiece, type GeneratedPiece } from "@/lib/ai/generate";
import { clampMeasures } from "@/lib/ai/prompt";

const MAX_PARALLEL = 2;
const FAIL_LIMIT = 5; // wrong passwords allowed per client ...
const FAIL_WINDOW_MS = 10 * 60_000; // ... in this window
const JOB_TTL_MS = 30 * 60_000;
const UUID = /^[0-9a-f-]{36}$/;

interface Job {
  status: "running" | "done" | "error";
  stage: string;
  result?: Omit<GeneratedPiece, "check"> & { measures: number; notesCount: number };
  error?: string;
  at: number;
}
const jobs = new Map<string, Job>();
const failures = new Map<string, { n: number; since: number }>();

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const digest = (s: string) => createHash("sha256").update(s).digest();
const clientOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

/** GEMINI_MODEL may hold one model or a comma separated list (tried in order). */
function modelsFromEnv(): string[] | undefined {
  const m = process.env.GEMINI_MODEL?.split(",").map((x) => x.trim()).filter(Boolean);
  return m?.length ? m : undefined;
}

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.at > JOB_TTL_MS && j.status !== "running") jobs.delete(id);
  for (const [ip, f] of failures) if (now - f.since > FAIL_WINDOW_MS) failures.delete(ip);
}

export async function POST(request: Request) {
  sweep();
  const key = process.env.GEMINI_API_KEY;
  const password = process.env.GENERATE_PASSWORD;
  if (!key || !password) return json(501, { error: "La generación con IA no está configurada en este servidor." });

  const ip = clientOf(request);
  const f = failures.get(ip);
  if (f && f.n >= FAIL_LIMIT && Date.now() - f.since < FAIL_WINDOW_MS) return json(429, { error: "Demasiados intentos con contraseña incorrecta. Espera unos minutos." });

  let body: { title?: unknown; password?: unknown; measures?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Petición no válida." });
  }
  const given = typeof body.password === "string" ? body.password : "";
  if (!timingSafeEqual(digest(given), digest(password))) {
    const cur = failures.get(ip);
    failures.set(ip, cur && Date.now() - cur.since < FAIL_WINDOW_MS ? { n: cur.n + 1, since: cur.since } : { n: 1, since: Date.now() });
    return json(401, { error: "Contraseña incorrecta." });
  }
  failures.delete(ip);

  // the title is data for the model: single line, bounded, no control characters
  const title = (typeof body.title === "string" ? body.title : "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (title.length < 2) return json(400, { error: "Escribe el título de la pieza." });
  const measures = clampMeasures(body.measures);

  if ([...jobs.values()].filter((j) => j.status === "running").length >= MAX_PARALLEL) return json(429, { error: "Hay otras piezas generándose. Inténtalo en un minuto." });

  const id = randomUUID();
  const job: Job = { status: "running", stage: "Empezando…", at: Date.now() };
  jobs.set(id, job);
  // runs in the background of this server process; the browser polls GET
  void generatePiece({ title, measures, apiKey: key, model: modelsFromEnv(), onStage: (s) => (job.stage = s) })
    .then(({ check, ...piece }) => Object.assign(job, { status: "done", stage: "Listo", at: Date.now(), result: { ...piece, measures: check.measures, notesCount: check.notes } }))
    .catch((e: unknown) => {
      console.error("[generate] failed:", e instanceof Error ? e.message : e);
      Object.assign(job, { status: "error", at: Date.now(), error: e instanceof GeminiError ? e.message : "No se pudo generar la pieza. Inténtalo de nuevo." });
    });
  return json(202, { id });
}

export async function GET(request: Request) {
  sweep();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const job = UUID.test(id) ? jobs.get(id) : undefined;
  if (!job) return json(404, { error: "Trabajo desconocido o caducado." });
  return json(200, { status: job.status, stage: job.stage, ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) });
}
