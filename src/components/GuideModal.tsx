"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUTS } from "@/lib/edit/shortcuts";

const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary";
const block = "my-2 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[12px] leading-relaxed text-foreground";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-[11px] text-primary">{n}</span>
        {title}
      </h3>
      <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground [&_b]:text-foreground">{children}</div>
    </section>
  );
}

export default function GuideModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark max-h-[88vh] overflow-y-auto sm:max-w-3xl" aria-label="Guía del lenguaje">
        <DialogHeader>
          <DialogTitle className="text-base">Guía del lenguaje</DialogTitle>
          <DialogDescription>Cómo se convierte tu código en una partitura</DialogDescription>
        </DialogHeader>

        <Section n={1} title="El tiempo: 1 ciclo = 1 compás">
          <p>
            En Strudel todo se mide en <b>ciclos</b>. Over Strudel dibuja <b>cada ciclo como un compás de 4/4</b>. El código no
            “sabe” cuántos compases hay: una frase como <span className={code}>note(&quot;c4 e4 g4 c5&quot;)</span> dura
            <b> un ciclo</b> y Strudel la repite sin fin. La app solo <i>mira</i> los primeros N ciclos y dibuja cada uno.
          </p>
          <p>
            Por eso ese ejemplo muestra N compases <b>idénticos</b>: es el mismo ciclo repetido N veces.
          </p>
        </Section>

        <Section n={2} title="Cuántos compases se dibujan">
          <p>Lo indicas con una directiva (un comentario que Strudel ignora) en cualquier línea del código:</p>
          <pre className={block}>{`// @compases 8`}</pre>
          <p>
            Si no hay directiva, manda el selector <b>Compases</b> de la barra superior. Si hay directiva, el selector se bloquea y
            muestra <span className={code}>@compases 8</span>. Máximo 64.
          </p>
        </Section>

        <Section n={3} title="Que cada compás sea distinto">
          <p>
            Para que la pieza cambie compás a compás, reparte <b>un elemento por ciclo</b> con <span className={code}>&lt; &gt;</span>:
          </p>
          <pre className={block}>{`// @compases 4
note("<c4 e4 g4 c5>")        // compás 1: do · 2: mi · 3: sol · 4: do agudo
note("<[c4 e4] [g4 b4]>")    // alterna dos compases distintos`}</pre>
          <p>
            También sirven <span className={code}>.slow(2)</span> (una frase dura 2 compases) y{" "}
            <span className={code}>.every(2, rev)</span> (transformación cada 2 compases).
          </p>
        </Section>

        <Section n={4} title="Por qué a veces salen DOS pentagramas">
          <p>
            Es el <b>pentagrama doble</b> (como el piano): arriba clave de <b>Sol</b>, abajo clave de <b>Fa</b>, unidos por una llave.
            Aparece <b>automáticamente</b> cuando alguna nota está <b>por debajo del Do central (C4)</b>; esas notas bajan al
            pentagrama de Fa y el resto se queda en el de Sol. Los dos pentagramas son <b>el mismo compás</b> a la vez, no dos
            compases.
          </p>
          <pre className={block}>{`// @pentagrama auto    // (por defecto) 2 pentagramas solo si hay notas < C4
// @pentagrama piano   // fuerza siempre los 2 pentagramas
// @pentagrama sol     // fuerza 1 pentagrama (notas graves con líneas adicionales)`}</pre>
          <p>Encima de la partitura ves un resumen que te dice cuál de los casos se está aplicando y por qué.</p>
        </Section>

        <Section n={5} title="Varias voces a la vez">
          <p>
            <span className={code}>stack(a, b, c)</span> toca las capas a la vez. Si se solapan con distinta duración, se dibujan
            como <b>voces separadas</b> (plicas hacia arriba y hacia abajo); notas con el mismo inicio y duración forman acorde.
          </p>
        </Section>

        <Section n={6} title="Dinámicas y articulaciones">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className={code}>.gain(x)</span>: menor de 0.5 → <i>p</i>, hasta 0.85 → <i>mf</i>, más → <i>f</i> (solo se escribe cuando cambia).
            </li>
            <li>
              <span className={code}>.clip(x)</span>: ≤ 0.5 → staccato, &gt; 1 → tenuto.
            </li>
          </ul>
        </Section>

        <Section n={7} title="Cuantización">
          <p>
            Strudel usa tiempo continuo; la partitura, una rejilla. Cada evento se redondea a la <b>semicorchea más cercana</b>.
            Los tresillos y subdivisiones irregulares se aproximan (aún no hay notación de grupos especiales).
          </p>
        </Section>

        <Section n={8} title="Editar desde la partitura (bidireccional)">
          <p>
            La partitura y el código son <b>el mismo documento</b>. Si escribes código, se dibuja la partitura; si pones notas en la
            partitura, <b>se regenera el código</b> y suena lo que ves. Los compases siempre cuadran: los silencios se calculan solos.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Poner:</b> clic en el pentagrama. Junto al cursor ves <b>qué nota será</b> (nombre y duración); la duración se elige en la
              barra (o con <span className={code}>1–5</span>). <b>Arrastra hacia la derecha</b> para dibujarla más larga.
            </li>
            <li>
              <b>Modificar:</b> clic en una nota para seleccionarla; aparece un mini-menú encima con altura, duración, alteración,
              dinámica y articulación. <b>Rueda del ratón</b> sobre la nota = sube/baja su altura. Arrástrala para moverla.
            </li>
            <li>
              <b>Quitar:</b> <span className={code}>✕</span> del mini-menú, clic derecho sobre la nota o <span className={code}>Supr</span>.
            </li>
            <li>
              <b>Compases:</b> botones <span className={code}>＋ Compás</span> / <span className={code}>－ Compás</span> (o el bloque “Añadir compás” al final).
            </li>
            <li>
              <b>Auto-fusión:</b> dos notas en el mismo tiempo y con la misma duración forman <b>un acorde</b>. Una nota nueva recorta o
              sustituye lo que pisa; con <span className={code}>Alt</span> + clic se superpone en <b>otra voz</b>.
            </li>
            <li>
              <b>Deshacer:</b> <span className={code}>Ctrl+Z</span> también recupera el código que escribiste a mano.
            </li>
          </ul>
          <p>El código generado tiene siempre esta forma (cada paso lleva su duración en semicorcheas tras la <span className={code}>@</span>):</p>
          <pre className={block}>{`// @compases 2
note(\`
  c4@4 [e4,g4]@4 ~@8
  c5@16
\`)
  .gain(\`0.7@4 0.7@4 ~@8 0.95@16\`)   // dinámicas
  .slow(2)                              // 2 compases`}</pre>
          <p className="text-neutral-400">
            Limitación: al editar desde la partitura el código se reescribe en esta forma canónica (no conserva <span className={code}>every()</span>,
            funciones, etc.). Los bemoles se escriben como su sostenido equivalente.
          </p>
          <p className="pt-1 font-medium text-neutral-200">Atajos (con la partitura enfocada)</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <span className={`${code} whitespace-nowrap`}>{s.keys}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section n={9} title="Escribir en secuencia: notas y silencios">
          <p>
            Es el modo por defecto (<b>Secuencial</b>). Cada compás empieza como una <b>redonda de silencio</b>, y cada clic en el pentagrama escribe
            el <b>siguiente</b> elemento en el <b>cursor de entrada</b> (la línea violeta). El clic solo elige la <b>altura</b> (y el compás en el que trabajas):
            la nota nunca se coloca donde cae el ratón, así no aparecen corcheas sueltas sin haber llegado a esa subdivisión.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Duración:</b> la eliges en la barra (<span className={code}>1–5</span>, <span className={code}>.</span>). Una figura nunca cruza la barra de compás: se
              recorta a lo que queda, y las figuras que ya no caben se desactivan. La duración se acorta sola a lo que queda del compás.
            </li>
            <li>
              <b>Lo que queda libre</b> se escribe con silencios de la subdivisión que toca: tras una negra, <i>negra + blanca</i>; nunca corcheas ni silencios con puntillo
              si no se ha llegado a esa subdivisión.
            </li>
            <li>
              <b>Modo Silencio:</b> funciona igual que el de notas, pero escribe silencios (sustituye lo que hubiera). Cambia entre <b>Nota</b> y <b>Silencio</b> en cualquier
              momento con el botón o con <span className={code}>R</span>; ambos se mezclan en el mismo compás. <span className={code}>Intro</span> escribe en el cursor sin tocar el ratón.
            </li>
            <li>
              <b>Cada compás por separado:</b> un clic escribe en el compás donde lo haces, a continuación de lo que ya hay (o desde la redonda si está vacío).
              Un compás <b>lleno</b> no admite más (la tarjeta lo indica) y <b>nunca se crean compases solos</b>: se añaden con <span className={code}>＋ Compás</span>.
            </li>
            <li>
              <b>Cursor:</b> la línea violeta marca el punto exacto donde se escribirá. <span className={code}>Alt</span>+clic lo coloca donde hagas clic dentro de ese compás
              (y entonces <b>sobrescribe</b> desde ahí), y los botones ⏮ ⏭ lo llevan al principio o al final. En modo <b>Libre</b> la nota se coloca donde haces clic.
            </li>
          </ul>
        </Section>

        <Section n={10} title="Tonalidad (armadura de clave)">
          <p>
            Elige la tonalidad en la barra de edición (o escribe la directiva). La armadura se dibuja en <b>todos los sistemas</b> y las
            notas se escriben con su ortografía correcta (Si♭ en Fa mayor, La♯ en Sol mayor…). Al hacer clic en el pentagrama, la nota
            respeta la armadura: en Sol mayor, el Fa sale Fa♯, salvo que elijas ♭ ♮ ♯ en la barra.
          </p>
          <pre className={block}>{`// @tonalidad G       // Sol mayor
// @tonalidad Bb      // Si♭ mayor
// @tonalidad F#m     // Fa♯ menor (la "m" indica menor)`}</pre>
          <p>
            Con el interruptor <b>Transponer</b> activado, cambiar de tonalidad <b>transpone toda la obra</b> a la nueva tónica (por el camino más corto);
            desactivado, solo cambia la armadura y la ortografía, y las notas suenan igual.
          </p>
        </Section>

        <Section n={11} title="Hojas">
          <p>
            La partitura ocupa todo el panel y se reparte en <b>hojas</b> según el tamaño de la ventana. Cambia de hoja con el paginador de la parte
            inferior o con <span className={code}>Re Pág</span> / <span className={code}>Av Pág</span>. Al reproducir, la hoja avanza sola siguiendo el cursor.
          </p>
        </Section>

        <Section n={12} title="Atajos generales">
          <p>
            <span className={code}>Ctrl/⌘ + Enter</span> evalúa al instante (y actualiza el audio si está sonando). Mientras suena,
            un cursor recorre la partitura y se iluminan en el código las notas que suenan.
          </p>
        </Section>
      </DialogContent>
    </Dialog>
  );
}
