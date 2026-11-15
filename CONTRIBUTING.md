# Contributing to Over Strudel

Thanks for your interest! Bug reports, ideas and pull requests are welcome.

## Getting started

```bash
git clone https://github.com/crm107-ua/over-strudel.git
cd over-strudel
npm install          # .npmrc sets legacy-peer-deps (vitest/vite peer ranges)
npm run dev          # http://localhost:3000
```

Node.js ≥ 20.9 is required.

## Quality gates

Please make sure all of these pass before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test             # unit + integration tests, using the real Strudel engine
npm run build
```

For UI changes also run the end-to-end suite against a running server (it needs a Chrome/Chromium binary):

```bash
npm run dev &
npm run test:e2e -- http://localhost:3000 "/path/to/chrome"
```

## Where things live

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. In short:

- **Behaviour belongs in pure functions** under `src/lib` (`edit/doc.ts` for document operations, `middleware/` for
  engraving rules). The store and components should only wire them together.
- A new editing operation needs: the pure function in `src/lib/edit/doc.ts`, unit tests in `doc.test.ts`, an action in the
  store (`useScore.ts`), and — if it has a shortcut — an entry in `src/lib/edit/shortcuts.ts` (the guide renders that list).
- Anything that changes how code is generated must keep the round-trip tests green (`codegen.test.ts`): *document → code →
  Strudel → document* must be the identity.
- Rules that affect the user's mental model (entry contract, rest subdivisions, no implicit measures) are covered by tests;
  please extend them rather than loosening them.

## Conventions

- TypeScript strict, no `any` unless wrapping an untyped dependency (see `src/strudel.d.ts`).
- Keep modules small and documented where the *why* is not obvious.
- UI strings are currently Spanish; documentation and code comments are English.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `chore:`).
- Do not commit generated output (`.next`, `node_modules`, screenshots from test runs).

## Reporting bugs

Please include the Strudel code that triggers it, what you expected, what happened, and your browser. A screenshot of the
score helps a lot.

## License

By contributing you agree that your contributions are licensed under the **GNU AGPL v3 or later**, like the rest of the
project (see [LICENSE](LICENSE)).
