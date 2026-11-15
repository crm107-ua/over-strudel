// Next's `output: "standalone"` build does not include the static assets: copy them next to server.js so that
// `node .next/standalone/server.js` serves a complete app (used by the Docker image and by any plain-Node deployment).
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const standalone = resolve(root, ".next/standalone");

if (!existsSync(standalone)) {
  console.log("[postbuild] no standalone output, nothing to copy");
  process.exit(0);
}

const copies = [
  [resolve(root, ".next/static"), resolve(standalone, ".next/static")],
  [resolve(root, "public"), resolve(standalone, "public")],
];
for (const [from, to] of copies) {
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    console.log(`[postbuild] copied ${from.replace(root, ".")} -> ${to.replace(root, ".")}`);
  }
}
