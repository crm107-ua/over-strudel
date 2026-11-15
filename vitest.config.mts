import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Node ignores the "module" field and would load the IIFE build; use the ESM build like bundlers do.
      "@kabelsalat/web": path.resolve("node_modules/@kabelsalat/web/dist/index.mjs"),
      "@": path.resolve("src"),
    },
  },
  test: {
    server: { deps: { inline: [/@strudel/, /@kabelsalat/] } },
  },
});
