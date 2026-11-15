import { strFromU8, unzipSync } from "fflate";

export type ScoreFile = { kind: "musicxml"; xml: string; name: string } | { kind: "pdf"; bytes: Uint8Array; name: string };

const starts = (b: Uint8Array, s: string) => s.split("").every((c, i) => b[i] === c.charCodeAt(0));

/** Recognise what the user dropped: PDF, compressed MusicXML (.mxl, a zip) or plain MusicXML. Throws a readable Error. */
export function readScoreBytes(bytes: Uint8Array, name: string): ScoreFile {
  if (starts(bytes, "%PDF-")) return { kind: "pdf", bytes, name };
  if (starts(bytes, "PK")) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error("El archivo comprimido está dañado.");
    }
    let root: string | undefined;
    const container = files["META-INF/container.xml"];
    if (container) root = /full-path="([^"]+)"/.exec(strFromU8(container))?.[1];
    root ??= Object.keys(files).find((f) => !f.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(f));
    if (!root || !files[root]) throw new Error("El .mxl no contiene ninguna partitura MusicXML.");
    return { kind: "musicxml", xml: strFromU8(files[root]), name };
  }
  const head = strFromU8(bytes.subarray(0, 400)).replace(/^﻿/, "").trimStart();
  if (head.startsWith("<")) return { kind: "musicxml", xml: strFromU8(bytes).replace(/^﻿/, ""), name };
  throw new Error("Formato no reconocido: usa un PDF, .musicxml, .xml o .mxl.");
}

export async function readScoreFile(file: File): Promise<ScoreFile> {
  return readScoreBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}


export interface OmrProgress {
  status: "queued" | "running";
  /** place in the queue (1 = next), 0 while it is being recognised */
  position: number;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("cancelado", "AbortError"))), { once: true });
  });

/**
 * Send a PDF to the OMR service and return the MusicXML it recognised. The job is started and then polled, so it works
 * behind a reverse proxy; `onProgress` reports the queue position.
 */
export async function recognisePdf(
  bytes: Uint8Array,
  opts: { signal?: AbortSignal; onProgress?: (p: OmrProgress) => void; timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const why = async (res: Response, fallback: string) => (await res.json().then((j: { error?: string }) => j.error).catch(() => undefined)) ?? fallback;
  const start = await fetch("/api/omr", { method: "POST", headers: { "content-type": "application/pdf" }, body: bytes as unknown as BodyInit, signal: opts.signal });
  if (!start.ok) throw new Error(await why(start, `No se pudo iniciar el reconocimiento (${start.status}).`));
  const { id } = (await start.json()) as { id: string };
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60_000);
  for (;;) {
    await wait(opts.pollMs ?? 2000, opts.signal);
    const res = await fetch(`/api/omr?id=${encodeURIComponent(id)}`, { signal: opts.signal, cache: "no-store" });
    if (!res.ok) throw new Error(await why(res, `El reconocimiento falló (${res.status}).`));
    const j = (await res.json()) as { status: string; position?: number; xml?: string; error?: string };
    if (j.status === "done" && j.xml) return j.xml;
    if (j.status === "error") throw new Error(j.error ?? "El reconocimiento falló.");
    opts.onProgress?.({ status: j.status === "running" ? "running" : "queued", position: j.position ?? 0 });
    if (Date.now() > deadline) throw new Error("El reconocimiento tardó demasiado.");
  }
}
