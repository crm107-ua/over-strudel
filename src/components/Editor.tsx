"use client";
import { useEffect, useRef } from "react";
import MonacoEditor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { subscribePlayhead } from "@/lib/playhead";
import { useScore } from "@/store/useScore";

const DEBOUNCE_MS = 300;

const FUNCS: [string, string][] = [
  ["note", 'note("c4 e4 g4")'],
  ["n", 'n("0 2 4").scale("C4:major")'],
  ["stack", "stack(\n  $0\n)"],
  ["cat", "cat($0)"],
  ["seq", "seq($0)"],
  ["gain", "gain(0.8)"],
  ["clip", "clip(0.5)"],
  ["slow", "slow(2)"],
  ["fast", "fast(2)"],
  ["rev", "rev()"],
  ["every", "every(2, rev)"],
  ["scale", 'scale("C4:major")'],
  ["add", "add(n(1))"],
  ["degradeBy", "degradeBy(0.3)"],
  ["sometimes", "sometimes(x => x.add(note(12)))"],
  ["off", "off(0.25, x => x.add(note(7)))"],
  ["transpose", "transpose(12)"],
  ["arp", 'arp("0 1 2")'],
  ["chord", 'chord("<C Am F G>")'],
  ["legato", "legato(1)"],
  ["euclid", "euclid(3, 8)"],
];

type Monaco = Parameters<BeforeMount>[0];
type Provider = Parameters<Monaco["languages"]["registerCompletionItemProvider"]>[1];
type ProvideArgs = Parameters<NonNullable<Provider["provideCompletionItems"]>>;

let registered = false;
const beforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("over-strudel", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "string", foreground: "98c379" },
      { token: "number", foreground: "d19a66" },
      { token: "keyword", foreground: "c678dd" },
    ],
    colors: {
      "editor.background": "#0b0d12",
      "editor.lineHighlightBackground": "#161a2300",
      "editorLineNumber.foreground": "#3b4252",
      "editorLineNumber.activeForeground": "#8b93a7",
      "editorCursor.foreground": "#818cf8",
      "editor.selectionBackground": "#3b4a8a66",
    },
  });
  if (registered) return;
  registered = true;
  monaco.languages.registerCompletionItemProvider("javascript", {
    provideCompletionItems: (model: ProvideArgs[0], pos: ProvideArgs[1]) => {
      const w = model.getWordUntilPosition(pos);
      const range = {
        startLineNumber: pos.lineNumber,
        endLineNumber: pos.lineNumber,
        startColumn: w.startColumn,
        endColumn: w.endColumn,
      };
      return {
        suggestions: FUNCS.map(([label, insertText]) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Strudel",
          range,
        })),
      };
    },
  });
};

export default function Editor() {
  const code = useScore((s) => s.code);
  const setCode = useScore((s) => s.setCode);
  const evaluate = useScore((s) => s.evaluate);
  const play = useScore((s) => s.play);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unsub = useRef<() => void>(undefined);

  useEffect(() => {
    evaluate(); // initial render
    return () => {
      clearTimeout(timer.current);
      unsub.current?.();
    };
  }, [evaluate]);

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      clearTimeout(timer.current);
      const c = editor.getValue();
      setCode(c);
      evaluate(c);
      if (useScore.getState().isPlaying) play();
    });

    // Playback highlight: light up the exact source tokens of the events that are sounding now.
    const model = editor.getModel()!;
    const decos = editor.createDecorationsCollection();
    let lastKey = "";
    let lastLine = -1;
    unsub.current = subscribePlayhead((t) => {
      const st = useScore.getState();
      if (t === null || st.evaluatedCode !== editor.getValue()) {
        if (lastKey) {
          decos.clear();
          lastKey = "";
          lastLine = -1;
        }
        return;
      }
      const p = ((t % st.measures) + st.measures) % st.measures; // the clock can be slightly negative at start
      const seen = new Set<string>();
      const ranges: [number, number][] = [];
      for (const e of st.events) {
        if (!e.locs || p < e.begin.n / e.begin.d || p >= e.end.n / e.end.d) continue;
        for (const r of e.locs) {
          const k = r.join(",");
          if (!seen.has(k)) {
            seen.add(k);
            ranges.push(r);
          }
        }
      }
      const key = [...seen].join("|");
      if (key === lastKey) return;
      lastKey = key;
      decos.set(
        ranges.map(([a, b]) => {
          const s = model.getPositionAt(a);
          const e = model.getPositionAt(b);
          return {
            range: new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column),
            options: { inlineClassName: "playing-token" },
          };
        }),
      );
      const line = ranges.length ? Math.min(...ranges.map((r) => model.getPositionAt(r[0]).lineNumber)) : -1;
      if (line > 0 && line !== lastLine) {
        lastLine = line;
        editor.revealLineInCenterIfOutsideViewport(line, 0 /* smooth */);
      }
    });
  };

  return (
    <MonacoEditor
      height="100%"
      defaultLanguage="javascript"
      theme="over-strudel"
      beforeMount={beforeMount}
      value={code}
      onChange={(v) => {
        const c = v ?? "";
        if (c === useScore.getState().code) return;
        setCode(c);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => evaluate(c), DEBOUNCE_MS); // hot reload
      }}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineHeight: 22,
        fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
        fontLigatures: true,
        padding: { top: 14, bottom: 14 },
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        bracketPairColorization: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8 },
      }}
    />
  );
}
