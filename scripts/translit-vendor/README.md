## Provenance

These four files (`engine.ts`, `styles.ts`, `stress.ts`, `types.ts`) were copied on 2026-07-19 from the `hebrew-toolkit` project's `src/lib/translit/` directory, with a fix to make their relative imports carry explicit `.ts` extensions (so they run directly under `node --experimental-strip-types` without a build step). They depend on the `havarotjs` package (syllabification) via `node_modules` at the repo root — see the root `package.json`. If the upstream `hebrew-toolkit` engine changes, re-sync these files by hand; there is no automated linkage between the two repos.
