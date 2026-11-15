import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { Metadata } from "next";
import DocsApp, { type DocSection } from "@/components/docs/DocsApp";
import { SHORTCUTS } from "@/lib/edit/shortcuts";

export const metadata: Metadata = {
  title: "Documentación · Over Strudel",
  description: "Guía completa de Over Strudel: tiempo y compases, edición en la partitura, referencia de funciones de Strudel, sonidos y exportación a PDF.",
};

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const shortcutsTable = () =>
  ["| Tecla | Acción |", "| --- | --- |", ...SHORTCUTS.map((s) => `| \`${s.keys.replace(/\|/g, "\\|")}\` | ${s.label} |`)].join("\n");

/** content/docs/*.md → sections (rendered at build time, the page is fully static). */
function loadSections(): DocSection[] {
  const dir = path.join(process.cwd(), "content", "docs");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
      const title = /title:\s*(.+)/.exec(fm?.[1] ?? "")?.[1]?.trim() ?? f;
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "").replace("{{SHORTCUTS}}", shortcutsTable());
      const html = (marked.parse(body, { gfm: true }) as string)
        .replace(/^<h1[^>]*>[\s\S]*?<\/h1>\s*/, "") // the section title is rendered by the page
        .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, t: string) => `<h2 id="${slug(f)}-${slug(t)}">${t}</h2>`);
      const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => ({ id: `${slug(f)}-${slug(m[1])}`, title: m[1].replace(/[`*]/g, "") }));
      return { id: f.replace(/^\d+-/, "").replace(/\.md$/, ""), order: parseInt(f, 10), title, html, headings };
    });
}

export default function DocsPage() {
  return <DocsApp sections={loadSections()} />;
}
