# HANDOFF — rashi-search (updated 2026-09-23)

**Next action:** Verify the `bavli-mobile` fix on a real phone (or the built-in browser's mobile emulation covered the functional side; a real-device Jetsam check is still open), then merge `bavli-mobile` → `main` and push.

## Current state (2026-09-23): bavli.html mobile-crash fix implemented, on branch `bavli-mobile`
- **Branch `bavli-mobile`, not merged/pushed** (2 commits over main `61e9529`): `3f6211e` (lazy per-tractate shards + scoped free-text search + yielding) and `8b8f177` (fix: TRACTATES entries were missing the manifest `file` field, so every shard fetch 404'd — caught during mobile-viewport verification of the first commit).
- **Fix-ladder steps 1–3 from the previous entry are done:**
  1. **Lazy per-tractate shards.** `loadAll()` now only fetches `manifest.json` on open (instant). A specific-tractate query (smart search resolving a tractate, or Fields mode with a masechet typed) calls `ensureShard(en)`, which fetches+indexes just that one shard on demand, memoized so rapid keystrokes share one in-flight fetch. Verified live: `brachos 2a` loads only `Berakhot.json` (17 results, 1.2 ms); `שבת כא.` loads only `Shabbat.json` (the largest shard, 33 results); Fields mode with masechet=יומא loads only `Yoma.json`. No other shard fetched in any of these.
  2. **Scoped free-text search.** A query with no tractate captured (cross-Shas free text, or Fields mode with masechet="All" + kw/dh/daf) no longer auto-loads everything. It shows an inline prompt — "Searching across all of Shas needs the full text loaded (~131 MB) — enter a masechet or daf to search just that one instantly, or **load all of Shas**" — gated behind a button (`renderLoadAllPrompt`/`loadAllAndSearch`). Clicking it sequentially loads the remaining tractates with a live progress count ("Loading all of Shas (15/36 masechtos)…") and auto-runs the pending search once done. Verified live: typing נר חנוכה with no tractate shows the prompt; clicking through loads all 36 and returns 60 results (306.7 ms) spanning multiple tractates with zero console errors.
  3. **Yielding during index build.** `ingestRecordsChunked()` appends records/NORM/chipusIndex/DOC_INDEX in 1500-record slices with a `setTimeout(…, 0)` yield between slices — applies uniformly to a single shard load and to the full-Shas opt-in load, so the tab stays responsive (the full-Shas load's progress counter visibly ticks up live rather than freezing).
- **`resolveSoft()`'s corpus-wide alias verification** (used when a transliterated tractate name is matched fuzzily, or matched exactly but combined with free text) now only runs once `allLoaded` is true — under lazy loading it can't mean anything checked against a partial, arbitrary subset of Shas, so it trusts the alias match instead of second-guessing it. Documented inline at `resolveSoft()`.
- **Memory measured in the built-in browser (mobile 375×812 viewport, Chromium — not real iOS Safari, see open question below):** default lazy path ~38–89 MB `performance.memory.usedJSHeapSize` depending on which single shard is loaded (Shabbat, the largest tractate at 8,729 records/7 MB, is the worst case for a single-shard load). The opt-in "load all of Shas" path reaches ~1 GB once fully loaded — expected and matches the original crash math, but it's now an explicit user action, not the automatic behavior on page open.
- **Verified no console errors** across: initial load, located smart-search queries (Hebrew and transliterated), Fields-mode masechet lookup, the cross-Shas gate prompt, the full "load all" path, and expanding a result (verse/Rashi text/Sefaria link/authorship disclaimer all render correctly — confirmed on a Bava Batra Rashbam-continuation hit, `cx` flag and note logic untouched).
- **Data/build pipeline unchanged.** `build_bavli.py` and `data/bavli/*.json` were already split per-tractate with a `manifest.json` (this was true before this session — the fix only changed how `bavli.html` *consumes* that existing shard layout, lazily instead of eagerly).
- `chumash.html` and `nach.html` were not touched (verified via `git diff main --stat`: only `bavli.html` changed).

## Previous state (2026-08-23), before this session's fix
- **Nach SHIPPED (2026-08-23).** `nach.html` is a third standalone sibling app; `index.html` hub now links chumash / bavli / nach. 34 books, 20,413 Rashis, 12 MB across 34 shards in `data/nach/` (force-added for Pages; `data/` is gitignored).
- **All committed AND pushed** (main = `03411ca`, clean tree): `a6dedad` wave 1 (build_nach.py + lib/nach-aliases.js), `5777123` cache relocation, `c1942a4` wave 2 (nach.html), `03411ca` handoff. Pushed 2026-08-23; check the Pages deploy picked up data/nach.
- **Nach verified live, independently** (two separate agents, second one re-checking the first): ישעיהו ו == yeshaya 6 (30 Isaiah 6 results), תהילים כג → Psalms 23, `shmuel` alone → disambiguation prompt (no silent guess), `shmuel aleph 1` → I Samuel 1, pseudo-Rashi disclaimer renders on Chronicles/Ezra, Sefaria links 200 for multi-word and Roman-numeral titles. Zero console errors.
- **Timings (Nach):** load 261 ms, chipus index build 7.3 s, located queries 9–18 ms, free text 527 ms. Mobile 375×812: loads fine, layout usable, ~112 MB JS heap.
- **Data quality checked directly, not just claimed:** cx provenance count 2,202 == manifest's four pseudo-Rashi books; empty dh 0.50% (Bavli was 1.57%); zero footnote-markup leakage; Isaiah vt-alignment sample 192/200 (96%).
- **`build_nach.py` re-runs are free** — all raw caches (844 files, 29 MB) live in `data/`, matching build.py/build_bavli.py. `--no-links` flag exists to skip link-count fetching.
- **Alias table** (`lib/nach-aliases.js`): exact-spelling map consulted before folded/fuzzy. Only reachable fold collision in the full 44-book namespace is Nahum/Nehemiah (both → `NKM`), absorbed by the exact tier and verified live (`nachum 1` and `nechemia 1` each land correctly). Unqualified shmuel/melachim/divrei hayamim are AMBIG by design.

## bavli.html mobile crash — fix implemented, not yet merged (2026-09-23)
Original symptom (Tamar, 2026-08-23): blank / reload / never finishes loading on phone. Root cause was `bavli.html` eagerly `Promise.all`-ing all 36 shards and concatenating 121,983 records into one `DB` on page open — 131 MB of JSON, plus NORM arrays, plus a 57 s synchronous index build, past iOS Safari's Jetsam ceiling and the page watchdog. Fix-ladder steps 1–3 (lazy per-tractate shards, scoped free-text search behind an opt-in, yielding during index build) are implemented on branch `bavli-mobile` and functionally verified in the built-in browser at a 375×812 viewport — see "Current state" above for specifics. Step 4 (shrink per-record footprint) was not needed: the default lazy path already stays well under the crash threshold (~38–89 MB vs. the ~650–700 MB that caused the original crash).

**What's not yet done:**
- Not verified on a **real** iOS/Android device — the built-in browser tool used for verification is Chromium-based, not actual mobile Safari. The functional behavior (lazy loading, the opt-in gate, no console errors) should carry over, but the actual Jetsam/OOM behavior on a real phone is unconfirmed.
- Branch `bavli-mobile` has not been merged to `main` or pushed (per this session's instructions: never push, never merge from here).

## Open questions
- Repo is still private and bundles Sefaria text under the unverified vocalized-edition license — that blocks a public flip, not the private push (done 2026-08-23).
- Does anyone actually type `דה"י` (unqualified Divrei Hayamim abbreviation)? Registered as AMBIG by inference; drop it if it isn't a real idiom.
- Nach uses the same "Sefaria vocalized edition" whose license STRATEGY.md flags as unverified — still blocks any public flip of the repo.
- Fold the three sibling apps into STRATEGY's M1 generic-corpus refactor, or keep them as siblings? Three apps now duplicate a lot of machinery.
- Nach has no calendar boost (no parsha/daf-yomi analog). A haftarah boost was deliberately NOT invented — worth adding?
- Should Nach get the same lazy-loading treatment as Bavli? It currently still loads all 20,413 records eagerly (~112 MB heap) — that's under the crash threshold today, but worth a look if Nach ever grows or if the same pattern should be applied for consistency.

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && git checkout bavli-mobile && claude
# say: "Read HANDOFF.md — verify the bavli-mobile branch on a real device if possible, then merge to main and push"
```
