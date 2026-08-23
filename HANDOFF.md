# HANDOFF — rashi-search (updated 2026-08-23)

**Next action:** Fix bavli.html's mobile crash — implement lazy per-tractate shard loading, scope free-text search, and yield during the chipus index build.

## Current state
- **Nach SHIPPED (2026-08-23).** `nach.html` is a third standalone sibling app; `index.html` hub now links chumash / bavli / nach. 34 books, 20,413 Rashis, 12 MB across 34 shards in `data/nach/` (force-added for Pages; `data/` is gitignored).
- **All committed AND pushed** (main = `03411ca`, clean tree): `a6dedad` wave 1 (build_nach.py + lib/nach-aliases.js), `5777123` cache relocation, `c1942a4` wave 2 (nach.html), `03411ca` handoff. Pushed 2026-08-23; check the Pages deploy picked up data/nach.
- **Nach verified live, independently** (two separate agents, second one re-checking the first): ישעיהו ו == yeshaya 6 (30 Isaiah 6 results), תהילים כג → Psalms 23, `shmuel` alone → disambiguation prompt (no silent guess), `shmuel aleph 1` → I Samuel 1, pseudo-Rashi disclaimer renders on Chronicles/Ezra, Sefaria links 200 for multi-word and Roman-numeral titles. Zero console errors.
- **Timings (Nach):** load 261 ms, chipus index build 7.3 s, located queries 9–18 ms, free text 527 ms. Mobile 375×812: loads fine, layout usable, ~112 MB JS heap.
- **Data quality checked directly, not just claimed:** cx provenance count 2,202 == manifest's four pseudo-Rashi books; empty dh 0.50% (Bavli was 1.57%); zero footnote-markup leakage; Isaiah vt-alignment sample 192/200 (96%).
- **`build_nach.py` re-runs are free** — all raw caches (844 files, 29 MB) live in `data/`, matching build.py/build_bavli.py. `--no-links` flag exists to skip link-count fetching.
- **Alias table** (`lib/nach-aliases.js`): exact-spelling map consulted before folded/fuzzy. Only reachable fold collision in the full 44-book namespace is Nahum/Nehemiah (both → `NKM`), absorbed by the exact tier and verified live (`nachum 1` and `nechemia 1` each land correctly). Unqualified shmuel/melachim/divrei hayamim are AMBIG by design.

## Known problem: bavli.html crashes on mobile
Confirmed symptom (Tamar, 2026-08-23): blank / reload / never finishes loading on phone. Mechanism: `bavli.html:319` `Promise.all`s all 36 shards and `:327` concatenates 121,983 records into one `DB` — 131 MB of JSON, plus NORM arrays, plus a 57 s synchronous index build. Nach's measured ~112 MB heap for 20,413 records implies ~9× disk→heap expansion, putting Bavli near 650–700 MB before indexing overhead. That is past iOS Safari's Jetsam ceiling, and 57 s on the main thread also trips the page watchdog. Fix ladder, highest leverage first:
1. **Lazy per-tractate shards.** `data/bavli/manifest.json` already exists and located queries ("ברכות ב.", "brachos 2a") resolve a tractate *before* needing data. Peak memory → ~7 MB worst case (Shabbat), index build → under 2 s.
2. **Scope free-text search.** Cross-Shas free text genuinely needs all 122K records; make it an explicit opt-in that loads progressively, not the default that kills the tab on open.
3. **Yield during index build** (`await new Promise(r => setTimeout(r))` every N records) so the watchdog doesn't fire and progress is legible. Nach's 7.3 s build at 20K records says this tier matters more than its position suggests.
4. Only if 1–3 fall short: shrink per-record footprint (drop eager NORM arrays, or pack shard text into one string with offset indices).

## Open questions
- Repo is still private and bundles Sefaria text under the unverified vocalized-edition license — that blocks a public flip, not the private push (done 2026-08-23).
- Does anyone actually type `דה"י` (unqualified Divrei Hayamim abbreviation)? Registered as AMBIG by inference; drop it if it isn't a real idiom.
- Nach uses the same "Sefaria vocalized edition" whose license STRATEGY.md flags as unverified — still blocks any public flip of the repo.
- Fold the three sibling apps into STRATEGY's M1 generic-corpus refactor, or keep them as siblings? Three apps now duplicate a lot of machinery.
- Nach has no calendar boost (no parsha/daf-yomi analog). A haftarah boost was deliberately NOT invented — worth adding?

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md and fix the bavli.html mobile crash"
```
