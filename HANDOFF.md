# HANDOFF — rashi-search (updated 2026-08-23)

**Next action:** None urgent — pick an item from "Future ideas" below, or decide on an open question.

## Current state
- **Bavli mobile crash FIXED (2026-08-23).** `bavli.html` now loads only `data/bavli/manifest.json` at boot (92 ms, 3 MB heap), resolves a tractate from the query text and loads just that shard for located queries (`brachos 2a` → 130 ms warm, 1 ms search), and gates cross-Shas free text behind an explicit opt-in that streams shards with progress instead of loading all 122K records by default. Index build now yields every 600 records (longest main-thread stall measured at 159 ms, down from a multi-second block). Peak heap in normal (single-tractate) use: 34–135 MB; the opt-in whole-Shas load still measures ~1.15 GB and remains desktop-only by design — see "Future ideas" for the fix. Verified live at 375×812: located Hebrew/transliterated queries, the Bava Batra Rashbam cx split at 29a, the Nedarim disclaimer, and the daf-yomi boost all still work. Committed as `93e0c09`, merged to `main`, pushed.
- **Nach SHIPPED (2026-08-23).** `nach.html` is a third standalone sibling app; `index.html` hub now links chumash / bavli / nach. 34 books, 20,413 Rashis, 12 MB across 34 shards in `data/nach/` (force-added for Pages; `data/` is gitignored).
- **All committed AND pushed** (main = `93e0c09`, clean tree): `a6dedad` wave 1 (build_nach.py + lib/nach-aliases.js), `5777123` cache relocation, `c1942a4` wave 2 (nach.html), `03411ca` handoff, `93e0c09` bavli mobile fix. Pushed 2026-08-23; check the Pages deploy picked up data/nach and the new bavli.html.
- **Nach verified live, independently** (two separate agents, second one re-checking the first): ישעיהו ו == yeshaya 6 (30 Isaiah 6 results), תהילים כג → Psalms 23, `shmuel` alone → disambiguation prompt (no silent guess), `shmuel aleph 1` → I Samuel 1, pseudo-Rashi disclaimer renders on Chronicles/Ezra, Sefaria links 200 for multi-word and Roman-numeral titles. Zero console errors.
- **Timings (Nach):** load 261 ms, chipus index build 7.3 s, located queries 9–18 ms, free text 527 ms. Mobile 375×812: loads fine, layout usable, ~112 MB JS heap.
- **Data quality checked directly, not just claimed:** cx provenance count 2,202 == manifest's four pseudo-Rashi books; empty dh 0.50% (Bavli was 1.57%); zero footnote-markup leakage; Isaiah vt-alignment sample 192/200 (96%).
- **`build_nach.py` re-runs are free** — all raw caches (844 files, 29 MB) live in `data/`, matching build.py/build_bavli.py. `--no-links` flag exists to skip link-count fetching.
- **Alias table** (`lib/nach-aliases.js`): exact-spelling map consulted before folded/fuzzy. Only reachable fold collision in the full 44-book namespace is Nahum/Nehemiah (both → `NKM`), absorbed by the exact tier and verified live (`nachum 1` and `nechemia 1` each land correctly). Unqualified shmuel/melachim/divrei hayamim are AMBIG by design.

## Future ideas
- **Shared inverted-word index across all corpora, instead of per-app full-record loading.** Discussed 2026-08-23 while closing out the bavli mobile fix. Today, any search — even the now-fixed bavli.html opt-in whole-Shas path — works by loading full records (dh/t/vt text) into memory and indexing them in the browser. A smaller, standard fix: precompute an inverted index at build time — folded word → doc locations (tractate/daf, or book/perek), no full text — so a query first hits a tiny lookup file, then fetches/scores only the shards that actually contain a match. This is the tier-4 idea from the bavli fix ladder generalized: it would let the opt-in whole-Shas Bavli search skip loading and indexing tractates that don't contain the query term at all, instead of the current all-or-nothing gate (which still measures ~1.15 GB heap once accepted).
  - At combined scale (Bavli 122K + Nach 20K + Chumash 7.8K ≈ 150K comments, ~100 MB raw text) this is still well inside normal search-engine territory — no sharding across machines needed, just the one standard trick (index of pointers, not text).
  - The natural home for this is a *shared* index across all three books, not three separate ones, which folds together with the M1 generic-corpus refactor below rather than sitting on top of it.
  - Complication: chipus's typo/transliteration-tolerant matching operates on *folded* keys (see `foldToken`/`foldTokenRefined` in `lib/chipus/src/fold.js`), so the precomputed index needs to be built from those folded forms, not literal spellings, or fuzzy matches would stop working.
  - Scope: touches `build_bavli.py`/`build_nach.py`/`build.py` (build an index artifact) and the app JS (query the index before fetching shards) — bigger than the mobile-crash fix, not attempted yet.

## Open questions
- Repo is still private and bundles Sefaria text under the unverified vocalized-edition license — that blocks a public flip, not the private push (done 2026-08-23).
- Does anyone actually type `דה"י` (unqualified Divrei Hayamim abbreviation)? Registered as AMBIG by inference; drop it if it isn't a real idiom.
- Nach uses the same "Sefaria vocalized edition" whose license STRATEGY.md flags as unverified — still blocks any public flip of the repo.
- Fold the three sibling apps into STRATEGY's M1 generic-corpus refactor, or keep them as siblings? Three apps now duplicate a lot of machinery.
- Nach has no calendar boost (no parsha/daf-yomi analog). A haftarah boost was deliberately NOT invented — worth adding?

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md" and pick up from Future ideas or Open questions
```
