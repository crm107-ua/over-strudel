import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const ID = "123e4567-e89b-12d3-a456-426614174000";
let server: Server;
let received = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/jobs") {
        received = Buffer.concat(chunks).length;
        res.statusCode = 202;
        return res.end(JSON.stringify({ id: ID }));
      }
      if (req.url === `/jobs/${ID}`) return res.end(JSON.stringify({ status: "done", position: 0, xml: "<score-partwise/>" }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "no" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.OMR_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.OMR_URL;
});

const pdf = (extra = "") => new TextEncoder().encode("%PDF-1.7\n" + "x".repeat(200) + extra);
const post = (body: Uint8Array | string) => POST(new Request("http://x/api/omr", { method: "POST", body: body as BodyInit }));

describe("/api/omr", () => {
  it("starts a job for a PDF and forwards the bytes", async () => {
    const res = await post(pdf());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: ID });
    expect(received).toBeGreaterThan(200);
  });

  it("rejects what is not a PDF", async () => {
    expect((await post("hola mundo".repeat(30))).status).toBe(415);
  });

  it("polls a job and returns the MusicXML", async () => {
    const res = await GET(new Request(`http://x/api/omr?id=${ID}`));
    expect(await res.json()).toEqual({ status: "done", position: 0, xml: "<score-partwise/>" });
  });

  it("validates the job id (no path injection)", async () => {
    expect((await GET(new Request("http://x/api/omr?id=../../health"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/omr"))).status).toBe(400);
  });

  it("says so when OMR is not configured", async () => {
    const keep = process.env.OMR_URL;
    delete process.env.OMR_URL;
    const res = await post(pdf());
    expect(res.status).toBe(501);
    expect((await res.json()).error).toMatch(/MusicXML/);
    process.env.OMR_URL = keep;
  });

  it("reports an unreachable service", async () => {
    const keep = process.env.OMR_URL;
    process.env.OMR_URL = "http://127.0.0.1:9";
    expect((await post(pdf())).status).toBe(502);
    process.env.OMR_URL = keep;
  });
});
