export interface Example {
  id: string;
  title: string;
  /** selector value used when the code has no `// @compases` directive */
  measures: number;
  code: string;
}

const L = (...lines: string[]) => lines.join("\n");

export const EXAMPLES: Example[] = [
  {
    id: "melodia",
    title: "Melodía con bajo · 8 compases",
    measures: 8,
    code: L(
      "// @compases 8        <- nº de compases a dibujar",
      "// @pentagrama auto   <- 2º pentagrama si hay notas < C4",
      "",
      "// 1 ciclo de Strudel = 1 compás.",
      "// <a b c> reparte UN elemento por compás,",
      "// así cada compás es distinto.",
      "stack(",
      "  // Mano derecha: 8 compases distintos",
      "  note(`<[c4 e4 g4 e4] [d4 f4 a4 f4] [e4 g4 b4 g4] [c4 g4 e4 c4]",
      "         [f4 a4 c5 a4] [g4 b4 d5 b4] [e4 g4 c5 g4] [c4@2 g4@2]>`),",
      "",
      "  // Mano izquierda (< C4: 2º pentagrama, clave de Fa)",
      "  note(`<[c3 g3] [d3 a3] [e3 b3] [c3 g3]",
      "         [f2 c3] [g2 d3] [e3 b3] c3>`)",
      ")",
      "  // Dinámica por compás: gain bajo = p, medio = mf, alto = f",
      '  .gain("<0.4 0.4 0.7 0.7 0.9 0.9 0.6 0.4>")',
      "",
    ),
  },
  {
    id: "escala",
    title: "Escala de Do mayor · 4 compases",
    measures: 4,
    code: L(
      "// @compases 4",
      "",
      "// 8 corcheas por compás: una escala completa en cada compás,",
      "// y cada compás empieza una nota más arriba.",
      "// Todas las notas son >= Do central -> un solo pentagrama (clave de Sol).",
      'n("0 1 2 3 4 5 6 7")',
      '  .add(n("<0 1 2 3>"))',
      '  .scale("C4:major")',
      "",
    ),
  },
  {
    id: "algoritmico",
    title: "Algorítmico (every / rev) · 8 compases",
    measures: 8,
    code: L(
      "// @compases 8",
      "",
      "// Transformación algorítmica: cada 2 compases se invierte la melodía",
      'note("c4 e4 g4 c5 g4 e4 d4 ~")',
      "  .every(2, rev)",
      '  .gain("<0.5 0.9>")',
      "",
    ),
  },
  {
    id: "polifonia",
    title: "Polifonía a tres voces · 4 compases",
    measures: 4,
    code: L(
      "// @compases 4",
      "",
      "// Tres capas simultáneas -> voces separadas, plicas arriba/abajo",
      "stack(",
      '  note("c5 d5 e5 f5 g5 a5 b5 c6"),',
      '  note("e4 ~ g4 ~").clip(0.4),   // clip bajo = staccato',
      '  note("c3 g3")                  // bajo Do central -> 2º pentagrama (Fa)',
      ").gain(0.7)",
      "",
    ),
  },
  {
    id: "hola",
    title: "Hola mundo · 1 compás repetido",
    measures: 4,
    code: L(
      "// @compases 4",
      "",
      "// Este patrón dura UN ciclo (= 1 compás)",
      "// y Strudel lo repite sin fin: por eso salen",
      "// 4 compases IDÉNTICOS. Tú decides cuántos",
      "// con @compases.",
      'note("c4 e4 g4 c5").gain("0.5 0.9")',
      "",
    ),
  },
];
