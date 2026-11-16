import { RESPONSE_SCHEMA, SYSTEM_PROMPT, repairPrompt, userPrompt } from "./prompt";
import { checkPiece, type PieceCheck } from "./validate";

export interface GeneratedPiece {
  title: string;
  composer: string;
  key: string;
  bpm: number;
  /** Spanish note from the model about fidelity / adaptations */
  notes: string;
  code: string;
  check: PieceCheck;
  /** how many times the model was asked (1 = right the first time) */
  attempts: number;
  model: string;
}

type Part = { text: string };
type Turn = { role: "user" | "model"; parts: Part[] };

export interface GenerateOptions {
  title: string;
  measures: number;
  apiKey: string;
  /** model(s) to try in order; the next one is used when a model is out of quota, overloaded or unavailable */
  model?: string | string[];
  /** how many repair rounds after the first answer (default 3) */
  maxRepairs?: number;
  onStage?: (stage: string) => void;
  /** called after every answer of the model with what the checker found (diagnostics) */
  onAttempt?: (info: { attempt: number; model: string; errors: string[]; notes: number }) => void;
  signal?: AbortSignal;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
}

/** Gemini models tried in order (the Pro models need a paid plan; these work on the free tier). */
export const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Strip a markdown fence the model may add around code, and normalise line endings. */
export function cleanCode(code: string): string {
  return code
    .replace(/^\s*```[a-z]*\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .concat("\n");
}

/** The answer was cut off by the length limit (a runaway answer, usually a repetition loop): worth asking again. */
export class TruncatedError extends Error {}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function ask(o: GenerateOptions, model: string, turns: Turn[]): Promise<Record<string, unknown>> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: turns,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 32768,
        // the model reasons before answering; bound it so the answer itself always fits
        thinkingConfig: model.startsWith("gemini-3") ? { thinkingLevel: "medium" } : { thinkingBudget: 8192 },
      },
    }),
    signal: o.signal ?? AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const detail = await res.json().then((j: { error?: { message?: string } }) => j.error?.message).catch(() => undefined);
    const friendly =
      res.status === 429 ? "Gemini está limitando las peticiones (cuota). Inténtalo en un minuto."
      : res.status === 401 || res.status === 403 ? "Gemini rechazó la clave de API."
      : res.status === 404 ? `El modelo ${model} no está disponible.`
      : `Gemini respondió ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}.`;
    throw new GeminiError(friendly, res.status);
  }
  const j = (await res.json()) as { usageMetadata?: Record<string, number>; candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const cand = j.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== "STOP") console.error("[gemini]", model, cand.finishReason, JSON.stringify(j.usageMetadata ?? {}));
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError(j.promptFeedback?.blockReason ? "Gemini bloqueó la petición." : "Gemini no devolvió ninguna respuesta.");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (cand?.finishReason === "MAX_TOKENS") throw new TruncatedError("La respuesta de Gemini se cortó por longitud.");
    throw new GeminiError("Gemini devolvió una respuesta que no es JSON válido.");
  }
}

/**
 * Ask the model for the piece, check it, and send its own errors back until it is right (or the attempts run out).
 * Never returns code that fails the check: the editor must be able to read back exactly what is delivered.
 */
/** Ask the first model that answers: 429 (quota), 503 (overloaded) and 404 (gone) move on to the next one. */
async function askAny(o: GenerateOptions, models: string[], turns: Turn[]): Promise<{ raw: Record<string, unknown>; model: string }> {
  let lastErr: unknown;
  for (const model of models) {
    try {
      return { raw: await ask(o, model, turns), model };
    } catch (e) {
      lastErr = e;
      if (!(e instanceof GeminiError) || ![429, 503, 404, 500].includes(e.status ?? 0)) throw e;
    }
  }
  throw lastErr;
}

export async function generatePiece(o: GenerateOptions): Promise<GeneratedPiece> {
  const models = o.model ? [o.model].flat() : DEFAULT_MODELS;
  const turns: Turn[] = [{ role: "user", parts: [{ text: userPrompt(o.title, o.measures) }] }];
  const max = 1 + (o.maxRepairs ?? 3);
  let last: PieceCheck | null = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    o.onStage?.(attempt === 1 ? "Transcribiendo la pieza…" : `Corrigiendo (intento ${attempt} de ${max})…`);
    let answer: { raw: Record<string, unknown>; model: string };
    try {
      answer = await askAny(o, models, turns);
    } catch (e) {
      if (!(e instanceof TruncatedError) || attempt === max) {
        throw e instanceof TruncatedError ? new GeminiError("La respuesta de Gemini se cortó por longitud repetidamente: pide menos compases.") : e;
      }
      // a runaway answer: ask again for a complete and concise one
      const last = turns[turns.length - 1];
      last.parts = [{ text: `${last.parts[0].text}

IMPORTANT: your previous reply was cut off by the length limit (a repetition loop). Answer again with the complete JSON, concise, no repetition; keep "notes" under 300 characters.` }];
      continue;
    }
    const { raw, model } = answer;
    const code = cleanCode(String(raw.code ?? ""));
    o.onStage?.("Comprobando los compases…");
    const check = checkPiece(code, o.measures);
    o.onAttempt?.({ attempt, model, errors: check.errors, notes: check.notes });
    if (check.ok) {
      return {
        title: String(raw.title ?? o.title),
        composer: String(raw.composer ?? ""),
        key: String(raw.key ?? ""),
        bpm: Number(raw.bpm) || check.bpm || 0,
        notes: String(raw.notes ?? ""),
        code,
        check,
        attempts: attempt,
        model,
      };
    }
    last = check;
    turns.push({ role: "model", parts: [{ text: JSON.stringify({ ...raw, code }) }] }, { role: "user", parts: [{ text: repairPrompt(check.errors) }] });
  }
  throw new GeminiError(`No se pudo generar una transcripción válida tras ${max} intentos (${last?.errors[0] ?? "formato incorrecto"}). Inténtalo de nuevo o prueba con menos compases.`);
}
