// Extracts the reference documentation (JSDoc) that ships with the @strudel packages into src/lib/docs/apiDocs.json.
// Run manually after upgrading Strudel:  node scripts/gen-api-docs.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const nm = join(root, "node_modules");
const SOURCES = [
  ["@strudel/core", "core"], ["@strudel/mini", "mini"], ["@strudel/tonal", "tonal"],
  ["@strudel/webaudio", "audio"], ["@strudel/draw", "visual"], ["@strudel/transpiler", "core"], ["superdough", "audio"],
];

const out = new Map();
for (const [pkg, area] of SOURCES) {
  const dir = join(nm, pkg);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(dir, f), "utf8");
    // the line after a block is only its declaration when it is not the opening of the next block
    const re = /\/\*\*([\s\S]*?)\*\/[ \t]*\n?[ \t]*(?!\/\*\*)([^\n]*)/g;
    let m;
    while ((m = re.exec(src))) {
      const body = m[1].split("\n").map((l) => l.replace(/^\s*\* ?/, "")).join("\n");
      if (!/@name|@example|@synonyms/.test(body) && !/^export /.test(m[2])) continue;
      const tag = (t) => [...body.matchAll(new RegExp("@" + t + "[ \\t]+([^\\n]*)", "g"))].map((x) => x[1].trim());
      let name = tag("name")[0];
      if (!name) {
        const d = /export (?:const|function|async function)\s+(?:\{\s*)?([A-Za-z_$][\w$]*)/.exec(m[2]);
        name = d?.[1];
      }
      if (!name) continue;
      const description = body.split(/\n@\w+/)[0].trim();
      const synonyms = [...tag("synonyms"), ...tag("alias")].flatMap((s) => s.split(/[,\s]+/)).filter(Boolean);
      const params = [...body.matchAll(/@param\s+\{([^}]*)\}\s+(\[?[\w.$]+\]?)\s*-?\s*([^\n]*)/g)].map((x) => ({ type: x[1], name: x[2], desc: x[3].trim() }));
      const examples = [...body.matchAll(/@example\s*\n?([\s\S]*?)(?=\n@\w+|$)/g)].map((x) => x[1].trim()).filter(Boolean);
      if (!description && !examples.length) continue;
      const prev = out.get(name);
      if (prev && prev.examples.length >= examples.length && prev.description.length >= description.length) continue;
      out.set(name, { name, synonyms, description, params, examples, area, file: f });
    }
  }
}
const list = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, "src/lib/docs/apiDocs.json"), JSON.stringify(list));
console.log(list.length, "documented functions");
