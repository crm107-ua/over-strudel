"use client";
import { ArrowLeft, Check, Copy, ExternalLink, Play, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_ORDER, FUNCTION_DOCS, type FnDoc } from "@/lib/docs/functions";
import banks from "@/lib/docs/soundBanks.json";
import { EXAMPLES } from "@/lib/examples";
import { VCSL_SOUNDS } from "@/lib/sounds";
import Logo from "../Logo";

export interface DocSection {
  id: string;
  order: number;
  title: string;
  html: string;
  headings: { id: string; title: string }[];
}

type View = { id: string; title: string; headings?: { id: string; title: string }[] };

const VIRTUAL: (View & { order: number })[] = [
  { id: "referencia", order: 70, title: "Referencia de funciones" },
  { id: "sonidos", order: 80, title: "Sonidos e instrumentos" },
  { id: "ejemplos", order: 85, title: "Ejemplos" },
];

/** Hands code to the editor page: it reads this key on load. */
function useOpenInEditor() {
  const router = useRouter();
  return (code: string) => {
    try {
      localStorage.setItem("os-open-code", code);
    } catch {
      /* storage unavailable: the editor just opens */
    }
    router.push("/");
  };
}

function CodeBlock({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const openInEditor = useOpenInEditor();
  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 pr-24 font-mono text-[12px] leading-relaxed text-foreground">{code}</pre>
      <div className="absolute right-2 top-2 flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copiar"
          title="Copiar"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
        >
          {done ? <Check /> : <Copy />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Probar en el editor" title="Probar en el editor" onClick={() => openInEditor(code)}>
          <Play />
        </Button>
      </div>
    </div>
  );
}

function FnCard({ f }: { f: FnDoc }) {
  return (
    <article id={`fn-${f.name}`} className="rounded-lg border border-border bg-card/40 p-4" data-testid="fn-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-[15px] font-semibold text-primary">{f.name}</h3>
        {f.aliases.length > 0 && <span className="font-mono text-[12px] text-muted-foreground">{f.aliases.join(" · ")}</span>}
        <span className="ml-auto flex gap-1.5">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{f.category}</span>
          {f.scoreNeutral && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">solo sonido / dispositivos</span>}
          {f.source === "over-strudel" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">añadida por Over Strudel</span>}
        </span>
      </header>
      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{f.description}</p>
      {f.params.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
          {f.params.map((p) => (
            <li key={p.name}>
              <code className="text-foreground">{p.name}</code> <span className="text-[11px] opacity-70">{p.type}</span> {p.desc && <>— {p.desc}</>}
            </li>
          ))}
        </ul>
      )}
      {f.examples.map((e, i) => (
        <CodeBlock key={i} code={e} />
      ))}
    </article>
  );
}

function Functions({ query }: { query: string }) {
  const [cat, setCat] = useState<string>("Todas");
  const [more, setMore] = useState({ key: "", n: 0 });
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const f of FUNCTION_DOCS) c.set(f.category, (c.get(f.category) ?? 0) + 1);
    return c;
  }, []);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      FUNCTION_DOCS.filter(
        (f) =>
          (cat === "Todas" || f.category === cat) &&
          (!q || f.name.toLowerCase().includes(q) || f.aliases.some((a) => a.toLowerCase().includes(q)) || f.description.toLowerCase().includes(q)),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [cat, q],
  );
  const shown = 60 + (more.key === `${cat}|${q}` ? more.n : 0); // "show more" resets when the filter changes
  const cats = CATEGORY_ORDER.filter((c) => counts.has(c));

  return (
    <div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        {FUNCTION_DOCS.length} funciones ({FUNCTION_DOCS.reduce((n, f) => n + 1 + f.aliases.length, 0)} nombres con sinónimos). Todas se aceptan en el editor y en el
        reproductor. Las descripciones proceden de la documentación de Strudel (en inglés) y se completan en español donde no existe. Pulsa ▶ de un ejemplo para probarlo en el editor.
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Categorías">
        {["Todas", ...cats].map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${cat === c ? "border-primary bg-primary/20 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {c} <span className="opacity-60">{c === "Todas" ? FUNCTION_DOCS.length : counts.get(c)}</span>
          </button>
        ))}
      </div>
      <p className="mb-2 text-[12px] text-muted-foreground" data-testid="fn-count">
        {list.length} resultados
      </p>
      <div className="space-y-3">
        {list.slice(0, shown).map((f) => (
          <FnCard key={f.name} f={f} />
        ))}
      </div>
      {shown < list.length && (
        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" onClick={() => setMore({ key: `${cat}|${q}`, n: (more.key === `${cat}|${q}` ? more.n : 0) + 80 })}>
            Mostrar más ({list.length - shown})
          </Button>
        </div>
      )}
    </div>
  );
}

function SoundChip({ name, n }: { name: string; n?: number }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copiar s("${name}")`}
      onClick={() => {
        void navigator.clipboard?.writeText(`s("${name}")`);
        setDone(true);
        setTimeout(() => setDone(false), 1000);
      }}
      className="rounded-md border border-border bg-card/40 px-2 py-1 font-mono text-[12px] text-foreground transition-colors hover:border-primary hover:bg-primary/10"
    >
      {done ? "copiado ✓" : name}
      {n !== undefined && <span className="ml-1 text-[10px] text-muted-foreground">{n}</span>}
    </button>
  );
}

const SYNTHS = ["sine", "sawtooth", "square", "triangle", "supersaw", "pulse", "white", "pink", "brown", "crackle", "user"];

function Sounds({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const m = (n: string) => !q || n.toLowerCase().includes(q);
  const drum = Object.entries(banks.drumMachines as Record<string, string[]>);
  const group = (title: string, hint: React.ReactNode, items: React.ReactNode[]) =>
    items.length ? (
      <section className="mb-6">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        <p className="mb-2 mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
        <div className="flex flex-wrap gap-1.5">{items}</div>
      </section>
    ) : null;
  return (
    <div>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Los sonidos se eligen en el código con <code className="text-primary">s(&quot;nombre&quot;)</code> o <code className="text-primary">.sound(&quot;nombre&quot;)</code>; la muestra concreta de
        un banco con <code className="text-primary">s(&quot;kalimba:3&quot;)</code>, y las baterías con <code className="text-primary">.bank(&quot;RolandTR909&quot;)</code>. Los bancos se cargan
        la primera vez que pulsas Reproducir. Pulsa un nombre para copiar <code>s(&quot;…&quot;)</code>. Dentro de las comillas el editor los sugiere.
      </p>
      {group(
        "Sintetizadores",
        <>
          Osciladores incorporados. Con <code>note(&quot;c3 e3&quot;).s(&quot;sawtooth&quot;)</code>. Más: <code>.vib()</code>, <code>.fm()</code>, <code>.lpf()</code>, envolventes…
        </>,
        SYNTHS.filter(m).map((n) => <SoundChip key={n} name={n} />),
      )}
      {group(
        `Instrumentos (VCSL) · ${VCSL_SOUNDS.length}`,
        "Instrumentos orquestales y del mundo (Virtual Community Sample Library). El número es la cantidad de muestras: s(\"harp:7\").",
        VCSL_SOUNDS.filter(([n]) => m(n)).map(([n, c]) => <SoundChip key={n} name={n} n={c} />),
      )}
      {group(
        `Piano, percusión india y otros`,
        "piano, mridangam, EmuSP12 y el resto del conjunto clásico de Tidal.",
        [
          ...(banks.piano as [string, number][]).filter(([n]) => m(n)).map(([n, c]) => <SoundChip key={"p" + n} name={n} n={c} />),
          ...(banks.mridangam as [string, number][]).filter(([n]) => m(n)).map(([n, c]) => <SoundChip key={"m" + n} name={n} n={c} />),
          ...(banks.emu as [string, number][]).filter(([n]) => m(n)).map(([n, c]) => <SoundChip key={"e" + n} name={n} n={c} />),
          ...(banks.dirt as [string, number][]).filter(([n]) => m(n)).map(([n, c]) => <SoundChip key={"d" + n} name={n} n={c} />),
        ],
      )}
      <section className="mb-6">
        <h3 className="text-[14px] font-semibold text-foreground">Máquinas de ritmos · {drum.length} bancos</h3>
        <p className="mb-2 mt-0.5 text-[12px] text-muted-foreground">
          Usa <code>s(&quot;bd sd hh&quot;).bank(&quot;RolandTR909&quot;)</code>. Cada banco ofrece los instrumentos que se listan.
        </p>
        <div className="space-y-2">
          {drum
            .filter(([b, ins]) => m(b) || ins.some(m))
            .map(([b, ins]) => (
              <div key={b} className="rounded-lg border border-border bg-card/40 px-3 py-2">
                <span className="font-mono text-[12px] font-semibold text-primary">{b}</span>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">{ins.join(" ")}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function Examples() {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">Los ejemplos de la cabecera. Pulsa ▶ para abrirlos en el editor.</p>
      {EXAMPLES.map((e) => (
        <section key={e.id}>
          <h3 className="text-[14px] font-semibold text-foreground">{e.title}</h3>
          <CodeBlock code={e.code} />
        </section>
      ))}
    </div>
  );
}

export default function DocsApp({ sections }: { sections: DocSection[] }) {
  const items: (View & { order: number })[] = useMemo(
    () => [...sections.map((s) => ({ id: s.id, order: s.order, title: s.title, headings: s.headings })), ...VIRTUAL].sort((a, b) => a.order - b.order),
    [sections],
  );
  const [active, setActive] = useState(items[0].id);
  const [query, setQuery] = useState("");

  const go = useCallback(
    (id: string, anchor?: string) => {
      setActive(id);
      setQuery("");
      history.replaceState(null, "", `#${anchor ?? id}`);
      requestAnimationFrame(() => (anchor ? document.getElementById(anchor)?.scrollIntoView({ block: "start" }) : window.scrollTo({ top: 0 })));
    },
    [],
  );

  // open the section named by the URL hash
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    const sec = items.find((i) => i.id === h || i.headings?.some((x) => x.id === h));
    if (sec) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash only exists in the browser, after hydration
      setActive(sec.id);
      requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: "start" }));
    }
  }, [items]);

  const current = items.find((i) => i.id === active) ?? items[0];
  const section = sections.find((s) => s.id === current.id);
  const searching = query.trim().length > 0 && !["referencia", "sonidos"].includes(active);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const fn = FUNCTION_DOCS.filter((f) => f.name.toLowerCase().includes(q) || f.aliases.some((a) => a.toLowerCase().includes(q))).slice(0, 8);
    const sn = VCSL_SOUNDS.filter(([n]) => n.includes(q)).slice(0, 10);
    const txt = sections.filter((s) => s.title.toLowerCase().includes(q) || s.html.toLowerCase().includes(q));
    return { fn, sn, txt };
  }, [query, sections]);

  return (
    <div className="dark min-h-screen bg-background text-foreground" data-testid="docs">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-[#0d0f15]/95 px-4 backdrop-blur">
        <Link href="/" className="flex items-center gap-2.5 text-foreground hover:opacity-90" aria-label="Volver a la aplicación">
          <Logo size={26} />
          <span className="text-[15px] tracking-[0.04em]">
            <span className="font-semibold">Over</span> <span className="font-light text-muted-foreground">Strudel</span>
          </span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-[14px]">Documentación</span>
        <Button variant="outline" size="sm" className="ml-auto" render={<Link href="/" />}>
          <ArrowLeft /> Volver al editor
        </Button>
      </header>

      <div className="mx-auto flex max-w-[1280px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r border-border p-4 md:block" aria-label="Secciones">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar función, sonido, tema…" className="h-8 pl-8" aria-label="Buscar en la documentación" data-testid="docs-search" />
          </div>
          <nav className="space-y-0.5">
            {items.map((s) => (
              <div key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active === s.id ? "page" : undefined}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${active === s.id && !searching ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {s.title}
                </button>
                {active === s.id && !searching && s.headings && s.headings.length > 0 && (
                  <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {s.headings.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => go(s.id, h.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:text-foreground">
                          {h.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
          <a
            href="https://strudel.cc/learn/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center gap-1.5 px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Documentación oficial de Strudel <ExternalLink className="size-3" />
          </a>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
          {/* narrow screens: the section list as a select */}
          <div className="mb-5 md:hidden">
            <select value={active} onChange={(e) => go(e.target.value)} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm" aria-label="Sección">
              {items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="mt-2 h-9" aria-label="Buscar" />
          </div>

          <article className="mx-auto max-w-3xl">
            {searching && searchResults ? (
              <div data-testid="docs-results">
                <h1 className="docs-h1">Resultados para «{query}»</h1>
                {searchResults.fn.length > 0 && (
                  <section className="mb-6">
                    <h2 className="docs-h2">Funciones</h2>
                    <ul className="space-y-1">
                      {searchResults.fn.map((f) => (
                        <li key={f.name}>
                          <button type="button" className="text-left text-[13px] text-primary hover:underline" onClick={() => { go("referencia"); }}>
                            <code>{f.name}</code>
                          </button>{" "}
                          <span className="text-[12px] text-muted-foreground">{f.description.slice(0, 110)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {searchResults.sn.length > 0 && (
                  <section className="mb-6">
                    <h2 className="docs-h2">Sonidos</h2>
                    <div className="flex flex-wrap gap-1.5">{searchResults.sn.map(([n, c]) => <SoundChip key={n} name={n} n={c} />)}</div>
                  </section>
                )}
                {searchResults.txt.length > 0 && (
                  <section className="mb-6">
                    <h2 className="docs-h2">En la guía</h2>
                    <ul className="space-y-1">
                      {searchResults.txt.map((s) => (
                        <li key={s.id}>
                          <button type="button" className="text-[13px] text-primary hover:underline" onClick={() => go(s.id)}>
                            {s.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!searchResults.fn.length && !searchResults.sn.length && !searchResults.txt.length && <p className="text-muted-foreground">Sin resultados.</p>}
                <Button variant="outline" size="sm" onClick={() => go("referencia")}>
                  Buscar en toda la referencia de funciones
                </Button>
              </div>
            ) : (
              <>
                <h1 className="docs-h1" data-testid="docs-title">{current.title}</h1>
                {section ? (
                  <div className="docs-prose" dangerouslySetInnerHTML={{ __html: section.html }} />
                ) : current.id === "referencia" ? (
                  <Functions query={query} />
                ) : current.id === "sonidos" ? (
                  <Sounds query={query} />
                ) : (
                  <Examples />
                )}
                <nav className="mt-12 flex justify-between border-t border-border pt-4 text-[13px]">
                  {(() => {
                    const i = items.findIndex((x) => x.id === current.id);
                    const prev = items[i - 1];
                    const next = items[i + 1];
                    return (
                      <>
                        {prev ? <button type="button" onClick={() => go(prev.id)} className="text-muted-foreground hover:text-foreground">← {prev.title}</button> : <span />}
                        {next ? <button type="button" onClick={() => go(next.id)} className="text-muted-foreground hover:text-foreground">{next.title} →</button> : <span />}
                      </>
                    );
                  })()}
                </nav>
              </>
            )}
          </article>
        </main>
      </div>
    </div>
  );
}
