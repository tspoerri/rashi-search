# HANDOFF — rashi-search (updated 2026-07-19)

**Next action:** Profile and fix the chipus v2 search-latency regression (~0.7–1.4 s/query, was 1.4–34 ms on v0.1) — suspect the refine pass × `search(q, {limit: DB.length})`; then run the calibration session with `node scripts/sample-rashis.mjs 10 --seed 1 --spread`.

## Current state
- All committed and pushed (main = 5f77bf4): https://github.com/tspoerri/rashi-search — clean tree.
- `lib/chipus/` is now a **git submodule** of https://github.com/tspoerri/chipus (chipus v2, vowel-aware ranking). Edit in place → commit/push inside `lib/chipus` → commit the pointer bump here. Pages workflow checks out submodules. Import path: `./lib/chipus/src/index.js`.
- Alias-guard tiers landed (42cbe2e): AMBIG sentinel on colliding alias keys, ≥3-char min on exact translit lookups, soft capture with corpus-agreement check (`resolveSoft`). "vhabor rek ein bo" → Gen 37:24 first; regression cases ("toldos", "lech lecha", "bereishis 12", typo "toldois") pass. Verified in Node harness + live browser.
- **Latency regression** (task chip task_eb21f8f4): steady-state queries ~689–1391 ms on chipus v2 (Hebrew control "ויאמר משה" = 1391 ms, on a path untouched by the alias work). Was 1.4–34 ms on v0.1.
- Known bug (task chip task_ac5aa2c6, pre-existing from 02316b7): "noach teiva" fuzzy 2-word alias false-positives to Ki Tavo and eats the query (kw empty → resolveSoft guard skips).
- `scripts/sample-rashis.mjs` ready for calibration: prints random Rashis (`--spread` stratifies by popularity) with transliteration prompts; Tamar's transliterations become test queries to tune params (e.g. popBoost, now capped at 50).
- STRATEGY.md: Nach + Shas expansion plan (M1–M5), plus Sefaria hosted-search note (5f77bf4).
- Test harness pattern (not in repo, rebuildable): extract inline module script from index.html, rewrite chipus import to absolute file path, stub DOM, load data/rashi.json, exercise smartParse/resolveSoft/search directly.

## Open questions
- Repo is private (bundles Sefaria Rashi text) — flip public? Also verify vocalized-edition license before Nach expansion.
- Precise `<mark>` highlighting for translit matches — worth the complexity?

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md and continue"
```
