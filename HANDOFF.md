# HANDOFF — rashi-search (updated 2026-09-24)

**Next action:** Start the `translit` branch work (transliterated-query support, see README "Planned").

## Current state (2026-09-24): bavli mobile-crash fix merged to `main` and pushed
Two agents independently built the same fix in parallel — one on branch `bavli-mobile` (commits `3f6211e`, `8b8f177`), one directly on `main` upstream (commit `93e0c09`, already pushed before this merge). Both diagnosed the same root cause and built the same three-tier fix; `origin/main`'s version (`93e0c09` + `5705ada` + `844948a`) turned out to be the more complete implementation, so it is the one now on `main` — it is a strict superset of the `bavli-mobile` branch's fix, including the exact same race-guard idea (`searchSeq` there vs. `searchGen` on the branch) for a slow shard-load clobbering a newer keystroke's render. The `bavli-mobile` branch's own commits (`3f6211e`, `8b8f177`) are superseded and were not cherry-picked in; nothing from them was unique. `GENERIC-SEARCH-STRATEGY.md` (new in `origin/main`) came along with the merge.

- **Root cause:** `bavli.html` eagerly `Promise.all`-ed all 36 tractate shards into one 121,983-record `DB` on page open — 131 MB of JSON plus NORM arrays plus a ~57 s synchronous chipus index build, past iOS Safari's Jetsam ceiling and the page watchdog.
- **Fix, three tiers:**
  1. **Lazy per-tractate shards.** Boot fetches only `manifest.json` (92 ms, ~3 MB heap). `smartParse` resolves a tractate from the query text before any records load, so a located query (`ברכות ב.`, `שבת כא:`) pays for exactly one shard via `ensureTractate()`, memoized so concurrent keystrokes share one in-flight fetch.
  2. **Cross-Shas free text is opt-in.** A query with no masechet captured shows a prompt stating the real cost (~131 MB / ~1.15 GB heap once indexed) instead of silently loading it; opting in streams shards in canonical order and re-runs the query progressively as each lands.
  3. **Yielding index build.** Normalizing/indexing runs in 600-record chunks with a yield between them (longest single main-thread slice measured 159 ms, down from a multi-second block).
  - Also: three dead NORM fields removed (~30 MB saved on Shabbat alone); result-order ties now break on canonical manifest position instead of load order, so results don't depend on which tractates happened to be loaded first.
- **Verified this session (2026-09-24), local server + built-in browser, `main` post-merge:** see "Merge verification" below for the actual run.
- **Data/build pipeline unchanged** — `build_bavli.py` / `data/bavli/*.json` were already split per-tractate with a `manifest.json`; this fix only changed how `bavli.html` consumes that layout.
- `chumash.html` and `nach.html` not touched by this fix.

## Merge verification (2026-09-24)
<!-- filled in after the phone-width + desktop check below -->

## Previous state (2026-08-23)
- **Nach SHIPPED (2026-08-23).** `nach.html` is a third standalone sibling app; `index.html` hub now links chumash / bavli / nach. 34 books, 20,413 Rashis, 12 MB across 34 shards in `data/nach/` (force-added for Pages; `data/` is gitignored).
- **All committed AND pushed** (main at the time = `93e0c09`, clean tree): `a6dedad` wave 1 (build_nach.py + lib/nach-aliases.js), `5777123` cache relocation, `c1942a4` wave 2 (nach.html), `03411ca` handoff, `93e0c09` bavli mobile fix.
- **Nach verified live, independently** (two separate agents, second one re-checking the first): ישעיהו ו == yeshaya 6 (30 Isaiah 6 results), תהילים כג → Psalms 23, `shmuel` alone → disambiguation prompt (no silent guess), `shmuel aleph 1` → I Samuel 1, pseudo-Rashi disclaimer renders on Chronicles/Ezra, Sefaria links 200 for multi-word and Roman-numeral titles. Zero console errors.
- **Timings (Nach):** load 261 ms, chipus index build 7.3 s, located queries 9–18 ms, free text 527 ms. Mobile 375×812: loads fine, layout usable, ~112 MB JS heap.
- **Data quality checked directly, not just claimed:** cx provenance count 2,202 == manifest's four pseudo-Rashi books; empty dh 0.50% (Bavli was 1.57%); zero footnote-markup leakage; Isaiah vt-alignment sample 192/200 (96%).
- **`build_nach.py` re-runs are free** — all raw caches (844 files, 29 MB) live in `data/`, matching build.py/build_bavli.py. `--no-links` flag exists to skip link-count fetching.
- **Alias table** (`lib/nach-aliases.js`): exact-spelling map consulted before folded/fuzzy. Only reachable fold collision in the full 44-book namespace is Nahum/Nehemiah (both → `NKM`), absorbed by the exact tier and verified live (`nachum 1` and `nechemia 1` each land correctly). Unqualified shmuel/melachim/divrei hayamim are AMBIG by design.

## Future ideas
- **Shared inverted-word index across all corpora, instead of per-app full-record loading.** Today, any search — even the opt-in whole-Shas Bavli path — works by loading full records (dh/t/vt text) into memory and indexing them in the browser. A smaller, standard fix: precompute an inverted index at build time — folded word → doc locations (tractate/daf, or book/perek), no full text — so a query first hits a tiny lookup file, then fetches/scores only the shards that actually contain a match.
  - At combined scale (Bavli 122K + Nach 20K + Chumash 7.8K ≈ 150K comments, ~100 MB raw text) this is still well inside normal search-engine territory — no sharding across machines needed, just the one standard trick (index of pointers, not text).
  - The natural home for this is a *shared* index across all three books, which folds together with the M1 generic-corpus refactor in `GENERIC-SEARCH-STRATEGY.md` rather than sitting on top of it.
  - Complication: chipus's typo/transliteration-tolerant matching operates on *folded* keys (see `foldToken`/`foldTokenRefined` in `lib/chipus/src/fold.js`), so the precomputed index needs to be built from those folded forms, or fuzzy matches would stop working.
  - Scope: touches `build_bavli.py`/`build_nach.py`/`build.py` (build an index artifact) and the app JS (query the index before fetching shards) — bigger than the mobile-crash fix, not attempted yet.
- **Transliterated (Latin-character) query support** — see README "Planned". In progress on branch `translit` as of 2026-09-24.

## Open questions
- Repo is still private and bundles Sefaria text under the unverified vocalized-edition license — that blocks a public flip, not the private push (done 2026-08-23).
- Does anyone actually type `דה"י` (unqualified Divrei Hayamim abbreviation)? Registered as AMBIG by inference; drop it if it isn't a real idiom.
- Fold the three sibling apps into STRATEGY's M1 generic-corpus refactor, or keep them as siblings? Three apps now duplicate a lot of machinery.
- Nach has no calendar boost (no parsha/daf-yomi analog). A haftarah boost was deliberately NOT invented — worth adding?
- Should Nach get the same lazy-loading treatment as Bavli? It currently still loads all 20,413 records eagerly (~112 MB heap) — under the crash threshold today, but worth a look if Nach ever grows.

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && git checkout translit && claude
# say: "Read HANDOFF.md, pick up the transliteration work on branch translit"
```
