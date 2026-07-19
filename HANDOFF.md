# HANDOFF

**Next action:** Review ranking/highlighting quality for translit-heavy queries (see "Open questions" below), then decide whether to commit the v2 changes (currently uncommitted in the working tree — `lib/` is untracked, `index.html` has unstaged edits).

## Current state (2026-07-17, v2 — translit support via vendored chipus)
- v1.1 base (English UI, accordion results, week/popularity ranking boosts) plus new transliterated-Hebrew (Latin-script) query support in the smart search box, built on the `chipus` library (../chipus, v0.1).
- **Vendored**: `lib/chipus/{fold,engine,gematria,index}.js` copied verbatim from `../chipus/src/` with a "do not edit here" provenance header on each file. Re-copy from there to pick up upstream changes. `../chipus/src` was NOT modified.
- `index.html` `<script>` is now `type="module"` and imports `{ ChipusIndex, foldToken, tokenize }` from `./lib/chipus/index.js`.
- At load: a `ChipusIndex` is built over fields `dh` (weight 3), `t` (weight 1), `vt` (weight 1) across all 7,816 records (~1.5s one-time build, shown in the header stat is unaffected — that stat times the DB.map/skel pass only).
- `search()`: the free-text `kw` scoring block now calls `chipusIndex.search(q.kw, {limit: DB.length})` once per query and intersects the result set with the filtered/looped records, adding `hit.score` on top of the existing filter/weekBoost/popBoost logic. The `dh`-field box scoring (fielded mode) is unchanged. The exact perek:passuk pin (keeps that passuk's Rashis visible even with no text match) is preserved.
- `smartParse()`: added Latin-script alias resolution for book and parsha names. At load, `BOOK_ALIAS` / `PARSHA_ALIAS1` (single-word) / `PARSHA_ALIAS2` (two-word, e.g. "lech lecha") maps are built by folding every book/parsha's Hebrew AND English name with `foldToken`/`tokenize`. In the parse loop, Latin tokens (`/[a-z]/i` test) that don't match an existing Hebrew alias fall through to a folded-key lookup in these maps — Hebrew-script behavior is byte-for-byte unchanged (it still uses the original exact-string comparisons first).
- Highlighting: unchanged (`highlight()` does normalized-substring matching against the display text). Latin/translit-only query tokens simply don't match any substring and are silently skipped — no crash, no special-casing needed, confirmed in browser testing.

## Verified in browser (python3 -m http.server 8641, Chromium preview)
All queries run in the Smart search tab, no console errors:
| Query | Result | Timing |
|---|---|---|
| `bereishis` | resolves to parsha Bereshit (60 results, top = Gen 1:1 dh exact) | 11.4 ms |
| `lech lecha 12` | resolves to parsha Lech Lecha + perek 12 (30 results, all correct) | 8.3 ms |
| `noach ish tzadik` | resolves parsha Noach + free-text "ish tzadik"; top hit = the pasuk containing "איש צדיק" | 34–55 ms (first hit ~55ms, steady-state ~34ms) |
| `בראשית א א` | book+perek+passuk exact pin → 3 results, Gen 1:1 | 2.1 ms |
| `toldos` | resolves to parsha Toldot (pure filter, no kw) | 1.4 ms |
| `shabbos` | free-text chipus search; matches שבת AND שבעת (both fold to the same consonant skeleton — expected chipus behavior, not a bug) | 24.2 ms |
| `berelshit` (typo) | doesn't resolve as a parsha alias (no fuzzy tolerance in the alias Map lookup — exact folded-key match only); falls through to free-text kw search, where chipus's fuzzy tier still surfaces Gen 1:1 (dh=בראשית) as the top 2 hits | 7.1 ms |

All under the 50ms budget in steady state; one cold-cache free-text query (3 tokens, no book/parsha filter so chipus scans the full corpus) briefly hit ~55ms on first keystroke.

## Open questions
- Book/parsha alias resolution is exact-folded-key only (no fuzzy) — a typo'd parsha name ("berelshit") falls through to the free-text kw path instead of resolving as a filter. That still surfaces the right records via chipus's own fuzzy tier, but doesn't narrow to the parsha filter. Worth deciding if that's acceptable or if the alias lookup should also try bounded edit distance.
- Highlighting for translit-only matches is currently a no-op (spec-approved fallback) — dh/body/verse text won't get `<mark>` when the query was pure Latin and matched via chipus's key-fold rather than substring. Precise field+wordIndex-based highlighting (chipus's `matches` array carries this) was scoped out as "complex"; revisit if it matters in practice.
- Should keyword search also cover Onkelos or other meforshim later? (carried over from v1)

## Resume
```sh
cd ~/Documents/Projects/rashi-search && python3 build.py && python3 -m http.server 8641
# open http://localhost:8641/index.html
```
