/**
 * Optical music recognition for a PDF score, as asynchronous jobs (a recognition takes about a minute, longer than a
 * reverse proxy waits for a response):
 *
 *   POST /api/omr          body: the PDF     ->  202 { id }
 *   GET  /api/omr?id=...                     ->  { status: "queued" | "running" | "done" | "error", position, xml?, error? }
 *
 * The PDF is forwarded to the OMR service (Audiveris in a separate hardened container, see /omr) and its MusicXML is
 * handed back; the browser turns it into the editor's document (src/lib/import). Nothing is stored here.
 * Configure with OMR_URL (e.g. http://omr:8080). Without it the endpoint answers 501 and the editor says so.
 */
const MAX_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/;

const fail = (status: number, error: string) => Response.json({ error }, { status });
const base = () => process.env.OMR_URL?.replace(/\/$/, "");
const NOT_CONFIGURED = "El reconocimiento de PDF no está configurado en este servidor (OMR_URL). Puedes importar MusicXML (.musicxml / .mxl).";

export async function POST(request: Request) {
  const url = base();
  if (!url) return fail(501, NOT_CONFIGURED);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return fail(413, "El PDF supera el límite de 25 MB.");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return fail(413, "El PDF supera el límite de 25 MB.");
  if (body.length < 100 || String.fromCharCode(...body.subarray(0, 5)) !== "%PDF-") return fail(415, "El archivo no es un PDF.");
  try {
    const res = await fetch(`${url}/jobs`, { method: "POST", headers: { "content-type": "application/pdf" }, body, signal: AbortSignal.timeout(30_000) });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !j.id) return fail(res.status === 429 ? 429 : 502, j.error ?? "El servicio de reconocimiento no aceptó el PDF.");
    return Response.json({ id: j.id }, { status: 202 });
  } catch {
    return fail(502, "No se pudo contactar con el servicio de reconocimiento.");
  }
}

export async function GET(request: Request) {
  const url = base();
  if (!url) return fail(501, NOT_CONFIGURED);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "Identificador no válido.");
  try {
    const res = await fetch(`${url}/jobs/${id}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return fail(502, "No se pudo contactar con el servicio de reconocimiento.");
  }
}
